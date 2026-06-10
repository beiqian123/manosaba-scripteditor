/* --- 命令悬浮提示、重载匹配与编辑器初始化 ---
 *   getPositionalTokens, getOutputLiteralTokens 词法/位置标记提取
 *   findBestOverloadMatch 最佳重载匹配算法
 *   getCommandOverloadsFromLine 从行内容获取命令重载列表
 *   showCommandTooltip, hideCommandTooltip 悬浮提示显示/隐藏
 *   toggleTooltipPin, toggleOverload 固定提示与重载折叠
 *   highlightLine, clearLineHighlights, highlightLines 行高亮
 *   window.onload CodeMirror 编辑器初始化入口
 *   依赖: utils.js (editor 全局变量, escapeHtml, getEditorValue 等)
 *         tools-config.js (findCommandInConfig, editLineFromTooltip) */

let tooltipIsPinned = false;

/* 移除字符串中的引号和属性参数，获取位置性 Token */
function getPositionalTokens(str) {
    let s = str;
    s = s.replace(/\b[A-Za-z_]\w*\s*:\s*"[^"]*"/g, ' ');
    s = s.replace(/\b[A-Za-z_]\w*\s*:\s*\{[^}]*\}/g, ' ');
    s = s.replace(/\b[A-Za-z_]\w*\s*:\s*[^\s:"]+/g, ' ');
    s = s.replace(/"[^"]*"/g, ' ');
    s = s.replace(/\{[^}]*\}/g, ' ');
    return s.split(/\s+/).filter(t => t.length > 0);
}

/* 获取输出模板中的值 Token（去除非值部分） */
function getOutputLiteralTokens(output) {
    let s = output.replace(/^@\w+\s*/, '');
    s = s.replace(/\b[A-Za-z_]\w*\s*:\s*(?:"[^"]*"|\{[^}]*\}|\S+)/g, ' ');
    s = s.replace(/"[^"]*"/g, ' ');
    s = s.replace(/\{[^}]*\}/g, ' ');
    return s.split(/\s+/).filter(t => t.length > 0).map(t => t.toLowerCase());
}

/* 评分排序重载列表，选出最佳匹配 */
function findBestOverloadMatch(overloads, lineText) {
    if (overloads.length <= 1) return overloads;

    const trimmed = lineText.trim();
    const afterCmd = trimmed.replace(/^@\w+\s*/, '');

    /* 提取当前行中所有属性名 key: value */
    const lineKeys = new Set();
    const attrRegex = /([A-Za-z_][A-Za-z0-9_-]*)\s*:/g;
    let match;
    while ((match = attrRegex.exec(afterCmd)) !== null) {
        lineKeys.add(match[1].toLowerCase());
    }

    /* 提取当前行中所有引号字符串值 */
    const lineValues = [];
    const valueRegex = /"([^"]*)"/g;
    while ((match = valueRegex.exec(afterCmd)) !== null) {
        if (match[1].trim()) lineValues.push(match[1].trim());
    }

    /* 提取当前行中所有位置性 Token（非属性参数） */
    const linePosTokens = getPositionalTokens(afterCmd).map(t => t.toLowerCase());

    const scored = overloads.map(overload => {
        let score = 0;

        /* 参数名匹配：每个匹配的参数 +10，全部匹配额外 +20 */
        if (overload.params && overload.params.length > 0) {
            const paramMatches = overload.params.filter(p =>
                lineKeys.has(p.name.toLowerCase())
            ).length;
            score += paramMatches * 10;

            if (paramMatches === overload.params.length && overload.params.length > 0) {
                score += 20;
            }
        }

        /* 提取输出模板中的属性名集合 */
        const outputKeys = new Set();
        const outputMatch = overload.output.match(/@\w+\s*(.*)/);
        if (outputMatch) {
            const outputRegex = /([A-Za-z_][A-Za-z0-9_-]*)\s*:/g;
            while ((match = outputRegex.exec(outputMatch[1])) !== null) {
                outputKeys.add(match[1].toLowerCase());
            }
        }

        /* 行中已有的输出模板属性名：每个 +5；缺失的输出模板属性名：每个 -8 */
        const outputKeyMatches = [...lineKeys].filter(k => outputKeys.has(k)).length;
        score += outputKeyMatches * 5;

        const missingOutputKeys = [...outputKeys].filter(k => !lineKeys.has(k)).length;
        score -= missingOutputKeys * 8;

        /* 必填参数已填写：每个 +15 */
        if (overload.params) {
            const requiredPresent = overload.params
                .filter(p => p.required && lineKeys.has(p.name.toLowerCase()))
                .length;
            score += requiredPresent * 15;
        }

        /* 引号值匹配模板占位符：每个值 +3 */
        const outputPlaceholderCount = (overload.output.match(/\{\d+\}/g) || []).length;
        if (outputPlaceholderCount > 0 && lineValues.length > 0) {
            if (lineValues.length <= outputPlaceholderCount) {
                score += lineValues.length * 3;
            }
        }

        /* 位置性字面量精确匹配：每个匹配 +25，全部匹配额外 +35 */
        const outputLitTokens = getOutputLiteralTokens(overload.output);
        if (outputLitTokens.length > 0) {
            const literalMatches = linePosTokens.filter(t => outputLitTokens.includes(t)).length;
            score += literalMatches * 25;

            if (literalMatches === outputLitTokens.length && linePosTokens.length === outputLitTokens.length) {
                score += 35;
            }
        } else if (outputPlaceholderCount > 0 && linePosTokens.length > 0) {
            if (linePosTokens.length <= outputPlaceholderCount) {
                score += linePosTokens.length * 8;
            }
        }

        /* 完全匹配引号内容：+20（仅当模板无语义 Token 也无占位符时） */
        const outputQuoted = overload.output.match(/"([^"]*)"/g) || [];
        const lineQuotedCount = lineValues.length;
        if (outputQuoted.length > 0 && lineQuotedCount > 0 && outputPlaceholderCount === 0 && outputLitTokens.length === 0) {
            const hasMatchingContent = outputQuoted.some(q => {
                const inner = q.slice(1, -1).toLowerCase();
                return lineValues.some(v => v.toLowerCase() === inner);
            });
            if (hasMatchingContent) {
                score += 20;
            }
        }

        /* 当行内容几乎为空时轻微扣分，避免空匹配误选 */
        if (linePosTokens.length === 0 && outputLitTokens.length === 0 && outputPlaceholderCount === 0 && lineValues.length === 0) {
            score -= 10;
        }

        return { overload, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.map(s => s.overload);
}

/* 获取当前行对应的命令重载列表 */
function getCommandOverloadsFromLine(lineText) {
    if (!lineText || !lineText.trim().startsWith('@')) return [];

    const trimmed = lineText.trim();
    const cmdMatch = trimmed.match(/^@(\w+)/);
    if (!cmdMatch) return [];

    const cmdName = cmdMatch[1].toLowerCase();

    if (!toolsConfig || !toolsConfig.categories) return [];

    const overloads = [];

    for (const category of toolsConfig.categories) {
        for (const item of category.items) {
            if (item.tooltipEnabled === false) continue;
            let output = '';
            if (item.type === 'modal' && item.modal && item.modal.output) {
                output = item.modal.output;
            } else if (item.type === 'direct' && item.output) {
                output = item.output;
            }

            if (output) {
                const outputCmdMatch = output.match(/^@(\w+)/i);
                if (outputCmdMatch && outputCmdMatch[1].toLowerCase() === cmdName) {
                    const params = [];
                    const placeholderOrder = [];
                    const phRegex = /\{(\d+)\}/g;
                    let phMatch;
                    while ((phMatch = phRegex.exec(output)) !== null) {
                        placeholderOrder.push(parseInt(phMatch[1]));
                    }
                    if (item.modal && item.modal.fields) {
                        item.modal.fields.forEach((field, idx) => {
                            const phNum = idx < placeholderOrder.length ? placeholderOrder[idx] : (idx + 1);
                            params.push({
                                name: field.name,
                                desc: field.placeholder || field.type || '',
                                required: field.required || false,
                                placeholder: phNum
                            });
                        });
                    }

                    let fullTemplate = null;
                    if (item.modal && item.modal.fields) {
                        let maxPh = 0;
                        phRegex.lastIndex = 0;
                        while ((phMatch = phRegex.exec(output)) !== null) {
                            maxPh = Math.max(maxPh, parseInt(phMatch[1]));
                        }
                        let nextPh = maxPh + 1;
                        const optionalParts = [];
                        /* 将可选字段的 outputTemplate 中的 {N} 替换为递增占位符，拼接为完整模板 */
                        item.modal.fields.forEach((field) => {
                            if (field.fieldCategory === 'optional' && field.outputTemplate) {
                                let part = field.outputTemplate;
                                part = part.replace(/\{N\}/g, '{' + String(nextPh++) + '}');
                                optionalParts.push(part);
                            }
                        });
                        if (optionalParts.length > 0) {
                            fullTemplate = output + ' ' + optionalParts.join(' ');
                        }
                    }

                    overloads.push({
                        name: item.name,
                        categoryName: category.name,
                        command: outputCmdMatch[1],
                        params: params,
                        output: output,
                        fullTemplate: fullTemplate !== output ? fullTemplate : null,
                        type: item.type,
                        icon: item.icon || ''
                    });
                }
            }
        }
    }

    return overloads;
}

/* 显示命令悬浮提示窗 */
function showCommandTooltip(cm, pos) {
    const tooltip = document.getElementById('commandTooltip');
    if (!tooltip) return;

    const line = cm.getLine(pos.line);
    const overloads = getCommandOverloadsFromLine(line);

    if (!overloads || overloads.length === 0) {
        /* 即使没有匹配到命令，也检查是否属于条目列表块或多行模板块 */
        const templateBlock = typeof findMultiLineTemplateBlock === 'function' ? findMultiLineTemplateBlock(cm, pos.line) : null;
        const itemListBlock = templateBlock ? null : (typeof findItemListBlockInEditor === 'function' ? findItemListBlockInEditor(cm, pos.line) : null);
        const bannerBlock = templateBlock || itemListBlock;
        if (bannerBlock) {
            const titleEl = tooltip.querySelector('.tooltip-title');
            const countEl = tooltip.querySelector('.tooltip-overload-count');
            const contentEl = tooltip.querySelector('.tooltip-content');
            const tmplIcon = bannerBlock.item.icon || '📋';

            titleEl.textContent = bannerBlock.item.name;
            countEl.style.display = 'none';

            contentEl.innerHTML = '<div class="tooltip-template-banner" style="border-bottom:none;margin-bottom:0;padding-bottom:0;">' +
                '<span class="tooltip-template-banner-icon">' + tmplIcon + '</span>' +
                '<span class="tooltip-template-banner-name">' + escapeHtml(bannerBlock.item.name) + '</span>' +
                '<span class="tooltip-template-banner-category">[' + escapeHtml(bannerBlock.item.modal.title || bannerBlock.item.name) + ']</span>' +
                '<button class="tooltip-template-edit-btn" data-line="' + pos.line + '" data-tmpl-name="' + escapeHtml(bannerBlock.item.name) + '">编辑模板</button>' +
                '</div>';

            tooltip.style.display = 'block';
            const coords = cm.cursorCoords(pos);
            const tooltipRect = tooltip.getBoundingClientRect();
            let left = coords.left;
            let top = coords.bottom + 10;
            if (left + tooltipRect.width > window.innerWidth - 20) {
                left = window.innerWidth - tooltipRect.width - 20;
            }
            if (top + tooltipRect.height > window.innerHeight - 20) {
                top = coords.top - tooltipRect.height - 10;
            }
            tooltip.style.left = left + 'px';
            tooltip.style.top = top + 'px';
            return;
        }
        hideCommandTooltip();
        return;
    }

    if (tooltipIsPinned) {
        tooltipIsPinned = false;
        const pinBtn = document.getElementById('tooltipPinBtn');
        if (pinBtn) {
            pinBtn.classList.remove('pinned');
            pinBtn.textContent = '[' + getTooltipShortcut() + '] 固定/编辑';
        }
        tooltip.classList.remove('pinned');
    }

    const sortedOverloads = findBestOverloadMatch(overloads, line);

    const titleEl = tooltip.querySelector('.tooltip-title');
    const countEl = tooltip.querySelector('.tooltip-overload-count');
    const contentEl = tooltip.querySelector('.tooltip-content');

    const cmdName = sortedOverloads[0].command;
    titleEl.textContent = '@' + cmdName;

    if (sortedOverloads.length > 1) {
        countEl.textContent = sortedOverloads.length + ' 个重载';
        countEl.style.display = 'inline-block';
    } else {
        countEl.style.display = 'none';
    }

    let html = '';

    /* 检测多行模板块 */
    const templateBlock = typeof findMultiLineTemplateBlock === 'function' ? findMultiLineTemplateBlock(cm, pos.line) : null;
    const itemListBlock = templateBlock ? null : (typeof findItemListBlockInEditor === 'function' ? findItemListBlockInEditor(cm, pos.line) : null);
    const bannerBlock = templateBlock || itemListBlock;
    if (bannerBlock) {
        const tmplIcon = bannerBlock.item.icon || '📋';
        html += '<div class="tooltip-template-banner">';
        html += '<span class="tooltip-template-banner-icon">' + tmplIcon + '</span>';
        html += '<span class="tooltip-template-banner-name">' + escapeHtml(bannerBlock.item.name) + '</span>';
        html += '<span class="tooltip-template-banner-category">[' + escapeHtml(bannerBlock.item.modal.title || bannerBlock.item.name) + ']</span>';
        html += '<button class="tooltip-template-edit-btn" data-line="' + pos.line + '" data-tmpl-name="' + escapeHtml(bannerBlock.item.name) + '">编辑模板</button>';
        html += '</div>';
    }

    html += '<div class="tooltip-overloads">';
    sortedOverloads.forEach((overload, index) => {
        const isBest = index === 0 && sortedOverloads.length > 1;
        const isOnly = sortedOverloads.length === 1;
        const itemIcon = overload.icon || '';

        html += '<div class="tooltip-overload-item' + (isBest ? ' best-match' : '') + '">';
        html += '<div class="tooltip-overload-header" onclick="toggleOverload(this)">';
        html += '<span class="tooltip-overload-toggle">' + (isBest || isOnly ? '▾' : '▸') + '</span>';
        html += '<span class="tooltip-overload-icon">' + itemIcon + '</span>';
        html += '<span class="tooltip-overload-name">' + escapeHtml(overload.name) + '</span>';
        html += '<span class="tooltip-overload-category">' + escapeHtml(overload.categoryName) + '</span>';
        if (isBest) {
            html += '<span class="tooltip-best-badge">最佳匹配</span>';
        }
        html += '</div>';

        const displayStyle = (isBest || isOnly) ? 'block' : 'none';
        html += '<div class="tooltip-overload-body" style="display: ' + displayStyle + ';">';

        if (overload.fullTemplate) {
            html += '<div class="tooltip-overload-output">';
            html += '<span class="tooltip-label">简易模板: </span>';
            html += '<code class="tooltip-code">' + escapeHtml(overload.output) + '</code>';
            html += '</div>';
            html += '<div class="tooltip-overload-output" style="margin-top: 6px;">';
            html += '<span class="tooltip-label">完整模板: </span>';
            html += '<code class="tooltip-code">' + escapeHtml(overload.fullTemplate) + '</code>';
            html += '</div>';
        } else {
            html += '<div class="tooltip-overload-output">';
            html += '<span class="tooltip-label">模板: </span>';
            html += '<code class="tooltip-code">' + escapeHtml(overload.output) + '</code>';
            html += '</div>';
        }

        if (overload.params && overload.params.length > 0) {
            html += '<div class="tooltip-overload-params" style="margin-top:4px;">';
            html += '<span class="tooltip-label">参数: </span>';
            overload.params.forEach(param => {
                const requiredMark = param.required ? ' <span class="tooltip-required">*必填</span>' : '';
                const placeholderBadge = param.placeholder ? ' <span class="tooltip-placeholder">{' + param.placeholder + '}</span>' : '';
                html += '<div class="tooltip-param">';
                html += '<span class="tooltip-param-name">' + escapeHtml(param.name) + '</span>' + requiredMark + placeholderBadge;
                html += '<span class="tooltip-param-desc">' + escapeHtml(param.desc) + '</span>';
                html += '</div>';
            });
            html += '</div>';
        } else {
            html += '<div class="tooltip-no-params">无参数</div>';
        }

        if (overload.type === 'modal') {
            html += '<button class="tooltip-overload-edit-btn" data-line="' + pos.line + '" data-cmd="' + escapeHtml(overload.command) + '" data-name="' + escapeHtml(overload.name) + '">编辑</button>';
        }

        html += '</div>';
        html += '</div>';
    });
    html += '</div>';

    contentEl.innerHTML = html;

    const coords = cm.cursorCoords(pos);
    tooltip.style.display = 'block';

    const tooltipRect = tooltip.getBoundingClientRect();
    let left = coords.left;
    let top = coords.bottom + 10;

    if (left + tooltipRect.width > window.innerWidth - 20) {
        left = window.innerWidth - tooltipRect.width - 20;
    }
    if (top + tooltipRect.height > window.innerHeight - 20) {
        top = coords.top - tooltipRect.height - 10;
    }

    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
}

/* 隐藏命令悬浮提示窗 */
function hideCommandTooltip() {
    if (tooltipIsPinned) return;
    const tooltip = document.getElementById('commandTooltip');
    if (tooltip) {
        tooltip.style.display = 'none';
    }
}

/* 切换悬浮提示锁定/编辑模式 */
function toggleTooltipPin() {
    const tooltip = document.getElementById('commandTooltip');
    if (!tooltip || tooltip.style.display === 'none') return;

    tooltipIsPinned = !tooltipIsPinned;
    const pinBtn = document.getElementById('tooltipPinBtn');
    const shortcut = getTooltipShortcut();
    if (pinBtn) {
        if (tooltipIsPinned) {
            pinBtn.classList.add('pinned');
            pinBtn.textContent = '[' + shortcut + '] 已固定/可编辑';
            tooltip.classList.add('pinned');
        } else {
            pinBtn.classList.remove('pinned');
            pinBtn.textContent = '[' + shortcut + '] 固定/编辑';
            tooltip.classList.remove('pinned');
        }
    }
    if (!tooltipIsPinned) {
        hideCommandTooltip();
    }
}

/* 切换重载项的展开/折叠 */
function toggleOverload(headerEl) {
    const itemEl = headerEl.parentElement;
    if (!itemEl) return;
    const bodyEl = itemEl.querySelector('.tooltip-overload-body');
    const toggleEl = headerEl.querySelector('.tooltip-overload-toggle');
    if (!bodyEl || !toggleEl) return;

    if (bodyEl.style.display === 'none') {
        bodyEl.style.display = 'block';
        toggleEl.textContent = '▾';
    } else {
        bodyEl.style.display = 'none';
        toggleEl.textContent = '▸';
    }
}

/* 高亮指定行（CodeMirror 原生 gutter 标记） */
function highlightLine(lineNumber, type = 'error') {
    if (!editor) return;
    const marker = document.createElement('div');
    marker.className = 'cm-gutter-marker ' + (type === 'error' ? 'cm-gutter-error' : 'cm-gutter-warning');
    marker.textContent = type === 'error' ? '✕' : '⚠';
    editor.setGutterMarker(lineNumber - 1, 'error-gutter', marker);
}

/* 清空所有 gutter 高亮标记 */
function clearLineHighlights() {
    if (!editor) return;
    editor.clearGutter('error-gutter');
}

/* 批量高亮行号 */
function highlightLines(lineNumbers, type = 'error') {
    clearLineHighlights();
    lineNumbers.forEach(lineNum => {
        highlightLine(lineNum, type);
    });
}

window.onload = function() {
    /* 注册 GameScript 语法模式 */
    defineGameScriptMode();

    /* 创建 CodeMirror 编辑器实例 */
    editor = CodeMirror(document.getElementById('scriptEditor'), {
        value: localStorage.getItem('editorAutoSave') || '',
        mode: 'gamescript',
        theme: 'default',
        lineNumbers: true,
        styleActiveLine: true,
        autoCloseBrackets: true,
        matchBrackets: true,
        lineWrapping: true,
        tabSize: 4,
        indentUnit: 4,
        gutters: ['error-gutter', 'CodeMirror-linenumbers'],
        hintOptions: {
            hint: gameScriptHint,
            completeSingle: false
        },
        extraKeys: {
            Tab: cm => cm.replaceSelection('    ', 'end'),
            '@': cm => {
                cm.replaceSelection('@');
                setTimeout(() => {
                    cm.showHint({ hint: gameScriptHint });
                }, 50);
            }
        }
    });

    let tooltipTimeout = null;

    /* 输入 @ 后自动弹出命令补全 */
    editor.on('keyup', (cm, event) => {
        if (event.key === '@') {
            setTimeout(() => {
                cm.showHint({ hint: gameScriptHint });
            }, 50);
        }
    });

    let quickInputTimer = null;
    let categoryKeyTimer = null;

    /* 中文输入法输入结束后触发快速输入补全 */
    function triggerQuickInput() {
        if (quickInputItems.length === 0) return;
        clearTimeout(quickInputTimer);
        quickInputTimer = setTimeout(() => {
            editor.showHint({ hint: quickInputHint });
        }, 50);
    }

    /* 输入字符后检测分类快速输入前缀 */
    function checkCategoryHint() {
        if (!quickCategoryGroups || quickCategoryGroups.length === 0) return;
        clearTimeout(categoryKeyTimer);
        categoryKeyTimer = setTimeout(() => {
            const data = unifiedCategoryHint(editor);
            if (data) {
                editor.showHint({
                    hint: unifiedCategoryHint,
                    completeSingle: false
                });
            }
        }, 30);
    }

    editor.on('keyup', (cm, event) => {
        const key = event.key;
        if (/^[A-Z]$/.test(key)) {
            checkCategoryHint();
        }
    });

    editor.getInputField().addEventListener('compositionend', function() {
        triggerQuickInput();
        checkCategoryHint();
    });

    /* 加载配置并启用代码提示 */
    loadToolsConfig();
    setCodeHints(true);

    /* 恢复阅读模式显示级别的 Cookie 设置 */
    const readingInfoEnabled = getCookie('readingScriptInfo') === 'true';
    const onItem = document.getElementById('menuReadingOn');
    const offItem = document.getElementById('menuReadingOff');
    if (onItem && offItem) {
        onItem.style.fontWeight = readingInfoEnabled ? 'normal' : 'bold';
        offItem.style.fontWeight = readingInfoEnabled ? 'bold' : 'normal';
    }

    /* 从 Cookie 恢复页面样式（主题/字体等） */
    const savedFormat = getPageFormatFromCookie();
    if (savedFormat) {
        applyPageFormat(savedFormat);
    }

    const cmWrapper = editor.getWrapperElement();

    /* 鼠标在编辑区移动时延迟显示命令悬浮提示 */
    cmWrapper.addEventListener('mousemove', (event) => {
        if (!tooltipEnabled || tooltipIsPinned) return;
        if (tooltipTimeout) {
            clearTimeout(tooltipTimeout);
            tooltipTimeout = null;
        }

        tooltipTimeout = setTimeout(() => {
            const pos = editor.coordsChar({ left: event.clientX, top: event.clientY });
            if (pos) {
                showCommandTooltip(editor, pos);
            }
        }, 300);
    });

    /* 鼠标离开编辑区时隐藏悬浮提示 */
    cmWrapper.addEventListener('mouseleave', () => {
        if (!tooltipEnabled || tooltipIsPinned) return;
        if (tooltipTimeout) {
            clearTimeout(tooltipTimeout);
            tooltipTimeout = null;
        }
        hideCommandTooltip();
    });

    /* 固定/编辑按钮点击切换锁定状态 */
    const pinBtn = document.getElementById('tooltipPinBtn');
    if (pinBtn) {
        /* 根据 Cookie 中的设置更新按钮文本 */
        pinBtn.textContent = '[' + getTooltipShortcut() + '] 固定/编辑';
        pinBtn.title = '点击或按 ' + getTooltipShortcut() + ' 固定悬浮窗并显示编辑按钮';
        pinBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleTooltipPin();
        });
    }

    /* 悬浮提示中的编辑按钮：点击回填编辑器行 */
    document.addEventListener('mousedown', (e) => {
        const btn = e.target.closest('.tooltip-overload-edit-btn');
        if (btn) {
            e.stopPropagation();
            e.preventDefault();
            const lineNum = parseInt(btn.dataset.line);
            const cmd = btn.dataset.cmd;
            const name = btn.dataset.name;
            editLineFromTooltip(lineNum, cmd, name);
        }
        /* 多行模板编辑按钮 */
        const tmplBtn = e.target.closest('.tooltip-template-edit-btn');
        if (tmplBtn) {
            e.stopPropagation();
            e.preventDefault();
            const lineNum = parseInt(tmplBtn.dataset.line);
            const name = tmplBtn.dataset.tmplName;
            if (typeof editTemplateFromTooltip === 'function') {
                editTemplateFromTooltip(lineNum, name);
            }
        }
    });

    /* 快捷键：固定/解锁悬浮提示（默认 F2，可在设置中更改） */
    document.addEventListener('keydown', (e) => {
        if (e.key === getTooltipShortcut() && !e.repeat) {
            const tooltip = document.getElementById('commandTooltip');
            if (tooltip && tooltip.style.display !== 'none') {
                e.preventDefault();
                toggleTooltipPin();
            }
        }
    });

    /* 编辑器内任何键盘输入都自动隐藏命令悬浮框（固定状态下除外，但固定快捷键本身不触发隐藏） */
    editor.getInputField().addEventListener('keydown', (e) => {
        if (tooltipIsPinned) return;
        if (e.key === getTooltipShortcut()) return;
        const tooltip = document.getElementById('commandTooltip');
        if (tooltip && tooltip.style.display !== 'none') {
            hideCommandTooltip();
        }
    });

    /* 编辑器内容变化时清除错误高亮标注 */
    editor.on('change', function() {
        if (typeof clearLineHighlights === 'function') {
            clearLineHighlights();
        }
    });

    /* 注册全局快捷键（Ctrl+O 等快捷工具触发） */
    document.addEventListener('keydown', handleGlobalKeydown);

    /* 编辑器内容自动保存（每3秒） */
    setInterval(() => {
        if (editor && editor.getValue) {
            localStorage.setItem('editorAutoSave', editor.getValue());
        }
    }, 3000);

    /* 初始化历史回溯定时器（每10分钟保存快照） */
    if (typeof initHistoryTimer === 'function') {
        initHistoryTimer();
    }
};
