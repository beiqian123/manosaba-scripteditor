/* --- 配置加载与侧边栏交互 ---
 *   loadToolsConfig 从 JSON 加载快捷工具配置
 *   renderToolsFromConfig 侧边栏渲染
 *   toggleCategory, toggleAllCategories 分类折叠
 *   openDynamicModal, submitDynamicModal 动态模态框
 *   handleToolClick, insertDefaultSnippet 工具点击处理
 *   parseShortcut, handleGlobalKeydown 快捷键系统
 *   findCommandsInConfig, findCommandInConfig 命令查询
 *   parseLineFieldValues, buildItemTooltip 字段解析与提示
 *   clearEditor, goToConfigEditor 文件操作
 *   switchSidebarContent 侧边栏面板切换
 *   依赖: utils.js (editor, toolsConfig 等全局变量) */

let currentPanelFilter = null;

/* 从 JSON 加载快捷工具配置 */
async function loadToolsConfig() {
    try {
        const response = await fetch('快捷工具配置.json?' + Date.now());
        if (!response.ok) {
            throw new Error('Failed to load tools configuration');
        }
        toolsConfig = await response.json();
        populatePanelSelect();
        renderToolsFromConfig();
    } catch (error) {
        console.error('Error loading tools config:', error);
        document.getElementById('tools-container').innerHTML = '<p>配置加载失败</p>';
    }
}

/* 填充面板下拉选择框 */
function populatePanelSelect() {
    const select = document.getElementById('sidebarSelect');
    if (!select || !toolsConfig || !toolsConfig.panels) return;
    
    select.innerHTML = '';
    toolsConfig.panels.forEach((panel, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = panel.name;
        select.appendChild(option);
    });

    /* 添加 info.json 面板选项 */
    const infoOption = document.createElement('option');
    infoOption.value = '-1';
    infoOption.textContent = '编辑信息文件';
    select.appendChild(infoOption);
    
    if (toolsConfig.panels.length > 0 && currentPanelFilter === null) {
        currentPanelFilter = 0;
        select.value = 0;
    } else if (currentPanelFilter !== null && currentPanelFilter < toolsConfig.panels.length) {
        select.value = currentPanelFilter;
    }
}

/* 切换侧边栏面板内容（工具/info.json） */
function switchSidebarContent(panelIndex) {
    panelIndex = parseInt(panelIndex, 10);

    /* 特殊值 -1 表示 info.json 面板 */
    if (panelIndex === -1) {
        const tabContents = document.getElementsByClassName('sidebar-content');
        for (let i = 0; i < tabContents.length; i++) {
            tabContents[i].style.display = 'none';
        }
        const infoPanel = document.getElementById('info-panel');
        if (infoPanel) {
            infoPanel.style.display = 'block';
            renderInfoJsonPanel();
        }
        const toggleBtn = document.querySelector('.toggle-all-btn');
        if (toggleBtn) {
            toggleBtn.style.display = 'none';
        }
        infoJsonPanelActive = true;
        currentPanelFilter = -1;
        return;
    }

    infoJsonPanelActive = false;

    if (isNaN(panelIndex)) return;
    
    currentPanelFilter = panelIndex;
    renderToolsFromConfig();
    
    const tabContents = document.getElementsByClassName('sidebar-content');
    for (let i = 0; i < tabContents.length; i++) {
        tabContents[i].style.display = 'none';
    }

    document.getElementById('tools-tab').style.display = 'block';

    const toggleBtn = document.querySelector('.toggle-all-btn');
    if (toggleBtn) {
        toggleBtn.style.display = 'inline-block';
    }
}

/* 渲染侧边栏日常模式工具列表 */
function renderToolsFromConfig() {
    const container = document.getElementById('tools-container');
    if (!toolsConfig || !toolsConfig.categories) {
        container.innerHTML = '<p>无可用工具</p>';
        return;
    }

    let categoriesToRender = toolsConfig.categories;
    if (toolsConfig.panels && toolsConfig.panels.length > 0 && currentPanelFilter !== null) {
        const selectedPanel = toolsConfig.panels[currentPanelFilter];
        if (selectedPanel && selectedPanel.categories && selectedPanel.categories.length > 0) {
            categoriesToRender = toolsConfig.categories.filter(cat => 
                selectedPanel.categories.includes(cat.name)
            );
        }
    }

    if (categoriesToRender.length === 0) {
        container.innerHTML = '<p>该面板没有配置任何分类</p>';
        return;
    }

    let html = '';
    let categoryIndex = 0;
    categoriesToRender.forEach(category => {
        const categoryId = `category-${categoryIndex}`;
        html += `<div class="category" data-category-id="${categoryId}">`;
        html += `<div class="category-header" onclick="toggleCategory('${categoryId}')">`;
        html += `<span class="category-toggle">▾</span>`;
        html += `<h4>${escapeHtml(category.name)}</h4>`;
        html += `</div>`;
        html += `<div class="category-items">`;

        category.items.forEach(item => {
            const tooltip = buildItemTooltip(item);
            const itemNameEscaped = escapeHtml(item.name);
            const itemNameAttr = escapeHtml(item.name).replace(/"/g, '&quot;');
            if (item.type === 'modal') {
                html += `<div class="snippet" data-item-name="${itemNameAttr}" onclick="handleToolClick('${itemNameEscaped}')" title="${tooltip}">`;
                html += `<span class="snippet-icon">${item.icon}</span>${escapeHtml(item.name)}`;
                if (item.shortcut) {
                    html += `<span class="shortcut-badge">${escapeHtml(item.shortcut)}</span>`;
                }
                html += `</div>`;
            } else if (item.type === 'direct') {
                const outputEscaped = item.output
                    .replace(/\\/g, '\\\\')
                    .replace(/'/g, "\\'")
                    .replace(/\n/g, '\\n')
                    .replace(/\r/g, '\\r')
                    .replace(/"/g, '&quot;');
                html += `<div class="snippet" data-item-name="${itemNameAttr}" onclick="handleToolClick('${itemNameEscaped}', '${outputEscaped}')" title="${tooltip}">`;
                html += `<span class="snippet-icon">${item.icon}</span>${escapeHtml(item.name)}`;
                if (item.shortcut) {
                    html += `<span class="shortcut-badge">${escapeHtml(item.shortcut)}</span>`;
                }
                html += `</div>`;
            }
        });

        html += '</div></div>';
        categoryIndex++;
    });

    container.innerHTML = html;

    /* 为侧边栏工具块添加拖拽支持 */
    if (typeof _makeSidebarItemsDraggable === 'function') {
        _makeSidebarItemsDraggable();
    }
}

/* 折叠/展开单个分类 */
function toggleCategory(categoryId) {
    const category = document.querySelector(`[data-category-id="${categoryId}"]`);
    if (!category) return;

    const items = category.querySelector('.category-items');
    const toggle = category.querySelector('.category-toggle');
    const isCollapsed = items.style.display === 'none';

    if (isCollapsed) {
        items.style.display = 'block';
        toggle.textContent = '▾';
    } else {
        items.style.display = 'none';
        toggle.textContent = '▸';
    }
}

/* 全部折叠/展开侧边栏分类 */
function toggleAllCategories() {
    const categories = document.querySelectorAll('.category');
    allCategoriesCollapsed = !allCategoriesCollapsed;

    categories.forEach(category => {
        const items = category.querySelector('.category-items');
        const toggle = category.querySelector('.category-toggle');

        if (allCategoriesCollapsed) {
            items.style.display = 'none';
            toggle.textContent = '▸';
        } else {
            items.style.display = 'block';
            toggle.textContent = '▾';
        }
    });

    const toggleBtn = document.querySelector('.toggle-all-btn');
    if (toggleBtn) {
        toggleBtn.textContent = allCategoriesCollapsed ? '展开' : '折叠';
    }
}

/* 打开工具动态模态框（带预填值） */
function openDynamicModal(itemName, prefillValues) {
    const category = toolsConfig.categories.find(c =>
        c.items.some(item => item.name === itemName)
    );
    if (!category) return;

    const item = category.items.find(i => i.name === itemName);
    if (!item || item.type !== 'modal') return;

    currentModalConfig = item;

    const modalTitle = document.getElementById('dynamicModalTitle');
    const modalBody = document.getElementById('dynamicModalBody');
    const modalFooter = document.getElementById('dynamicModalFooter');

    modalTitle.textContent = item.modal.title;

    let bodyHtml = '';

    if (item.modal.description) {
        bodyHtml += `<div class="modal-description">${item.modal.description}</div>`;
    }

    _itemListData = {}; /* 重置条目列表数据 */

    item.modal.fields.forEach((field, index) => {
        const fieldId = `modal_field_${index}`;
        const requiredMark = field.required ? '<span class="required">*</span>' : '';
        const prefillVal = (prefillValues && prefillValues[index] !== undefined) ? prefillValues[index] : null;
        const defVal = prefillVal !== null ? prefillVal : (field.defaultValue || field.default || '');
        const actualDefVal = defVal.includes('|') ? defVal.split('|').pop().trim() : defVal;

        /* 条目列表特殊处理 */
        if (field.type === 'item_list') {
            /* 预填数据：如果 prefillVal 是数组，则作为条目列表数据 */
            const itemListPrefill = (Array.isArray(prefillVal)) ? prefillVal : null;
            bodyHtml += renderItemListField(field, fieldId, itemListPrefill, index);
            return;
        }

        bodyHtml += '<div class="form-group">';
        bodyHtml += `<label>${escapeHtml(field.name)}${requiredMark}</label>`;

        if (field.type === 'text') {
            bodyHtml += `<input type="text" id="${fieldId}" placeholder="${escapeHtml(field.placeholder || '')}" value="${escapeHtml(actualDefVal)}">`;
        } else if (field.type === 'number') {
            bodyHtml += `<input type="number" id="${fieldId}" placeholder="${escapeHtml(field.placeholder || '')}" step="${field.step || 'any'}" value="${escapeHtml(actualDefVal)}">`;
        } else if (field.type === 'date') {
            bodyHtml += `<input type="date" id="${fieldId}" value="${escapeHtml(actualDefVal)}">`;
        } else if (field.type === 'dropdown') {
            const options = field.options.split('、');
            bodyHtml += `<select id="${fieldId}">`;
            bodyHtml += `<option value="">${escapeHtml(field.placeholder || '请选择')}</option>`;
            options.forEach(opt => {
                const parts = opt.split('|');
                const value = parts.length === 2 ? parts[1].trim() : opt.trim();
                const label = parts.length === 2 ? parts[0].trim() : opt.trim();
                const selected = actualDefVal && value === actualDefVal ? ' selected' : '';
                bodyHtml += `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
            });
            bodyHtml += '</select>';
        } else if (field.type === 'selectable' || field.type === 'dropdown_custom') {
            /* 可编辑下拉：先试匹配已有选项，匹配上则显示下拉+隐藏输入，否则显示输入+隐藏下拉（含自定义选项） */
            const options = field.options ? field.options.split('、') : [];
            const customOptions = getCustomOptions(item.name, field.name);
            const allOptions = [...options, ...customOptions];
            let matchedOption = false;
            if (actualDefVal) {
                allOptions.forEach(opt => {
                    const parts = opt.split('|');
                    const value = parts.length === 2 ? parts[1].trim() : opt.trim();
                    if (value === actualDefVal) matchedOption = true;
                });
            }
            if (matchedOption) {
                bodyHtml += `<div class="selectable-input-wrapper">`;
                bodyHtml += `<select id="${fieldId}_select" onchange="handleSelectableChange('${fieldId}', this.value)" style="margin-bottom: 8px;">`;
                bodyHtml += `<option value="">${escapeHtml(field.placeholder || '请选择或输入内容')}</option>`;
                allOptions.forEach(opt => {
                    const parts = opt.split('|');
                    const value = parts.length === 2 ? parts[1].trim() : opt.trim();
                    const label = parts.length === 2 ? parts[0].trim() : opt.trim();
                    const selected = value === actualDefVal ? ' selected' : '';
                    bodyHtml += `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
                });
                bodyHtml += `<option value="__custom__">+ 自定义输入...</option>`;
                bodyHtml += `</select>`;
                bodyHtml += `<input type="text" id="${fieldId}" placeholder="${escapeHtml(field.placeholder || '输入或选择内容')}" style="display: none;">`;
                bodyHtml += `</div>`;
            } else {
                bodyHtml += `<div class="selectable-input-wrapper">`;
                bodyHtml += `<select id="${fieldId}_select" onchange="handleSelectableChange('${fieldId}', this.value)" style="margin-bottom: 8px;">`;
                bodyHtml += `<option value="">${escapeHtml(field.placeholder || '请选择或输入内容')}</option>`;
                allOptions.forEach(opt => {
                    const parts = opt.split('|');
                    const value = parts.length === 2 ? parts[1].trim() : opt.trim();
                    const label = parts.length === 2 ? parts[0].trim() : opt.trim();
                    bodyHtml += `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
                });
                bodyHtml += `<option value="__custom__">+ 自定义输入...</option>`;
                bodyHtml += `</select>`;
                bodyHtml += `<input type="text" id="${fieldId}" placeholder="${escapeHtml(field.placeholder || '输入或选择内容')}" value="${escapeHtml(actualDefVal)}" style="display: block;">`;
                bodyHtml += `</div>`;
            }
        } else if (field.type === 'image') {
            bodyHtml += `<input type="text" id="${fieldId}" placeholder="${escapeHtml(field.placeholder || '输入图片路径')}" value="${escapeHtml(actualDefVal)}" readonly>`;
            if (field.path) {
                bodyHtml += `<img src="${escapeHtml(field.path)}" style="max-width: 100%; margin-top: 10px;">`;
            }
        } else if (field.type === 'audio') {
            bodyHtml += `<input type="text" id="${fieldId}" placeholder="${escapeHtml(field.placeholder || '音频文件')}" value="${escapeHtml(actualDefVal)}" readonly>`;
            if (field.path) {
                bodyHtml += `<audio controls src="${escapeHtml(field.path)}" style="margin-top: 10px;">`;
            }
        } else if (field.type === 'checkbox') {
            const isChecked = prefillVal !== null ? (prefillVal === (field.checkedValue || 'true')) : (actualDefVal.toLowerCase() === 'checked');
            bodyHtml += `<label style="display: inline-flex; align-items: center; gap: 8px; cursor: pointer; white-space: nowrap;">`;
            bodyHtml += `<input type="checkbox" id="${fieldId}" value="${escapeHtml(field.checkedValue || 'true')}"${isChecked ? ' checked' : ''}>`;
            bodyHtml += `<span>${escapeHtml(field.label || field.placeholder || field.name)}</span>`;
            bodyHtml += `<span style="font-size: 11px; color: #999; font-weight: normal;">(选中: ${escapeHtml(field.checkedValue || 'true')} | 未选中: ${escapeHtml(field.uncheckedValue || 'false')})</span>`;
            bodyHtml += `<input type="hidden" id="${fieldId}_unchecked" value="${escapeHtml(field.uncheckedValue || 'false')}">`;
            bodyHtml += `</label>`;
        }

        bodyHtml += '</div>';
    });

    modalBody.innerHTML = bodyHtml;

    const isEditMode = currentEditPos !== null;
    modalFooter.innerHTML = `
        <button class="modal-btn modal-btn-secondary" onclick="closeModal('dynamicModal')">取消</button>
        <button class="modal-btn modal-btn-primary" onclick="submitDynamicModal()">${isEditMode ? '修改' : '插入'}</button>
    `;

    document.getElementById('dynamicModal').classList.add('show');
}

/* 在编辑器中查找多行模板块（从指定行出发，匹配已知的多行模板配置） */
function findMultiLineTemplateBlock(cm, lineNum) {
    if (!toolsConfig || !toolsConfig.categories) return null;

    /* 1. 找到包含 lineNum 的连续 @命令块 */
    let blockStart = lineNum;
    while (blockStart > 0) {
        const prev = cm.getLine(blockStart - 1);
        if (!prev || !prev.trim().startsWith('@')) break;
        blockStart--;
    }

    let blockEnd = lineNum;
    const totalLines = cm.lineCount();
    while (blockEnd < totalLines - 1) {
        const next = cm.getLine(blockEnd + 1);
        if (!next || !next.trim().startsWith('@')) break;
        blockEnd++;
    }

    const blockLen = blockEnd - blockStart + 1;
    if (blockLen < 2) return null;

    /* 收集块中所有行 */
    const blockLines = [];
    for (let i = blockStart; i <= blockEnd; i++) {
        blockLines.push(cm.getLine(i));
    }

    /* 2. 遍历所有配置项，匹配多行模板 */
    for (const category of toolsConfig.categories) {
        for (const item of category.items) {
            if (item.type !== 'modal' || !item.modal || !item.modal.output) continue;
            const output = item.modal.output;
            if (!output.includes('\n')) continue; /* 非多行模板跳过 */

            const tmplLines = output.split('\n');
            const tmplCount = tmplLines.length;
            if (tmplCount > blockLen) continue;

            /* 尝试在 blockLines 的每个偏移位置匹配模板 */
            for (let offset = 0; offset <= blockLen - tmplCount; offset++) {
                let sigMatch = true;

                /* 检查 @命令签名是否一致 */
                for (let i = 0; i < tmplCount; i++) {
                    const edMatch = blockLines[offset + i].trim().match(/^@(\w+)/);
                    const tmplMatch = tmplLines[i].trim().match(/^@(\w+)/);
                    if (!edMatch || !tmplMatch || edMatch[1].toLowerCase() !== tmplMatch[1].toLowerCase()) {
                        sigMatch = false;
                        break;
                    }
                }

                if (!sigMatch) continue;

                /* 签名匹配成功，拼接编辑器块文本 */
                const editorBlockText = blockLines.slice(offset, offset + tmplCount).join('\n');

                /* 用模板 output 构建正则：将 {N} 替换为捕获组 (.+) */
                const parts = output.split(/\{\d+\}/);
                let pattern = '';
                parts.forEach((part, i) => {
                    pattern += part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    if (i < parts.length - 1) pattern += '(.+)';
                });

                try {
                    const regex = new RegExp('^' + pattern + '$', 's');
                    const match = editorBlockText.match(regex);
                    if (match) {
                        /* 提取字段值 */
                        const fieldValues = {};
                        let phIdx = 0;
                        const phRegex = /\{(\d+)\}/g;
                        let phMatch;
                        while ((phMatch = phRegex.exec(output)) !== null) {
                            const fieldIndex = parseInt(phMatch[1]) - 1;
                            if (match[phIdx + 1] !== undefined) {
                                fieldValues[fieldIndex] = match[phIdx + 1].trim();
                            }
                            phIdx++;
                        }

                        return {
                            item,
                            startLine: blockStart + offset,
                            endLine: blockStart + offset + tmplCount - 1,
                            fieldValues
                        };
                    }
                } catch (e) {
                    /* 正则异常，跳过此项 */
                }
            }
        }
    }

    return null;
}

/* 重置编辑模式 */
function resetEditMode() {
    currentEditPos = null;
}

/* 从悬浮提示编辑指定行（单行命令编辑） */
function editLineFromTooltip(lineNum, cmd, itemName) {
    const lineText = editor.getLine(lineNum);
    if (!lineText) return;

    /* 先按常规方式查找（检查 item.modal.output） */
    const category = toolsConfig.categories.find(c =>
        c.items.some(item => {
            if (item.name !== itemName || item.type !== 'modal' || !item.modal) return false;
            if (item.modal.output && new RegExp('^@' + cmd + '\\b', 'i').test(item.modal.output)) return true;
            /* 也检查条目列表字段中的命令 */
            if (item.modal.fields) {
                return item.modal.fields.some(f => {
                    if (f.type !== 'item_list') return false;
                    const lines = [];
                    if (f.blockPrefix) lines.push(f.blockPrefix);
                    if (f.blockSuffix) lines.push(f.blockSuffix);
                    if (f.itemTemplate) lines.push(...f.itemTemplate.split('\n'));
                    return lines.some(l => l.trim().match(new RegExp('^@' + cmd + '\\b', 'i')));
                });
            }
            return false;
        })
    );
    if (!category) return;

    const item = category.items.find(i => i.name === itemName);
    if (!item || item.type !== 'modal') return;

    /* 如果条目包含 item_list 字段，尝试解析整个块来编辑 */
    const hasItemList = item.modal.fields && item.modal.fields.some(f => f.type === 'item_list');
    if (hasItemList) {
        const block = findItemListBlockInEditor(editor, lineNum);
        if (block) {
            if (block.field.blockPrefix) {
                /* 有 blockPrefix：路径A，需要 expandItemListEditRange 扩展范围 */
                const expanded = expandItemListEditRange(block, item);
                currentEditPos = { line: expanded.startLine, endLine: expanded.endLine };
                openDynamicModal(itemName, expanded.mergedData);
            } else {
                /* 无 blockPrefix：路径B，findItemListBlockInEditor 已扫描前置字段 */
                currentEditPos = { line: block.startLine, endLine: block.endLine };
                openDynamicModal(itemName, block.itemListData);
            }
            return;
        }
    }

    const parsedValues = parseLineFieldValues(lineText, item);

    currentEditPos = { line: lineNum };
    openDynamicModal(itemName, parsedValues);
}

/* 扩展条目列表块的编辑范围：向前搜索常规字段，向后搜索可选字段 */
function expandItemListEditRange(block, item) {
    let startLine = block.startLine;
    let endLine = block.endLine;
    const mergedData = { ...block.itemListData };
    const totalLines = editor.lineCount();
    
    /* 向前搜索：块前缀之前的常规字段（非 item_list） */
    for (let i = startLine - 1; i >= 0; i--) {
        const prevLine = editor.getLine(i);
        if (!prevLine.trim()) break;
        
        let matched = false;
        const outputLines = (item.modal.output || '').split('\n');
        for (const tmplLine of outputLines) {
            const phRegex = /\{(\d+)\}/g;
            const phMatches = [];
            let m;
            while ((m = phRegex.exec(tmplLine)) !== null) {
                phMatches.push(parseInt(m[1]));
            }
            if (phMatches.length === 0) continue;
            
            let rawPattern = tmplLine;
            phMatches.forEach((ph, idx) => {
                const isLast = idx === phMatches.length - 1;
                rawPattern = rawPattern.replace(`{${ph}}`, isLast ? '___CAPTURE_LAST___' : '___CAPTURE___');
            });
            let escaped = rawPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            escaped = escaped.replace(/___CAPTURE___/g, '(.+?)');
            escaped = escaped.replace(/___CAPTURE_LAST___/g, '(.+)');
            
            try {
                const regex = new RegExp('^' + escaped + '\\s*$');
                const match = prevLine.trim().match(regex);
                if (match) {
                    let fieldIdxAccum = 0;
                    item.modal.fields.forEach((field, idx) => {
                        if (field.type === 'item_list') return;
                        fieldIdxAccum++;
                        const phOrder = phMatches.indexOf(fieldIdxAccum);
                        if (phOrder >= 0 && match[phOrder + 1] !== undefined) {
                            let val = match[phOrder + 1].trim();
                            val = val.replace(/^"(.*)"$/, '$1');
                            if (!(idx in mergedData)) mergedData[idx] = val;
                        }
                    });
                    matched = true;
                }
            } catch (e) {}
            if (matched) break;
        }
        if (matched) {
            startLine = i;
        } else {
            break;
        }
    }
    
    /* 向后搜索：块后缀之后的可选字段 */
    for (let i = endLine + 1; i < totalLines; i++) {
        const lineText = editor.getLine(i);
        if (!lineText.trim()) break;
        
        let matched = false;
        item.modal.fields.forEach((field, index) => {
            if (field.type === 'item_list') return;
            if (field.fieldCategory === 'optional' && field.outputTemplate) {
                const parts = field.outputTemplate.split(/\{N\}/);
                let regexStr = '';
                parts.forEach((part, pi) => {
                    regexStr += part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    if (pi < parts.length - 1) regexStr += '(.+?)';
                });
                try {
                    const regex = new RegExp('^' + regexStr + '$', 'i');
                    const match = lineText.trim().match(regex);
                    if (match) {
                        let val = match[1].trim();
                        val = val.replace(/^"(.*)"$/, '$1');
                        if (!(index in mergedData)) mergedData[index] = val;
                        matched = true;
                    }
                } catch (e) {}
            }
        });
        if (matched) {
            endLine = i;
        } else {
            break;
        }
    }
    
    return { startLine, endLine, mergedData };
}

/* 从悬浮提示编辑多行模板块（仅由横幅「编辑模板」按钮触发） */
function editTemplateFromTooltip(lineNum, itemName) {
    const templateBlock = findMultiLineTemplateBlock(editor, lineNum);
    if (templateBlock) {
        currentEditPos = { line: templateBlock.startLine, endLine: templateBlock.endLine };
        openDynamicModal(templateBlock.item.name, templateBlock.fieldValues);
        return;
    }
    
    /* 尝试匹配条目列表块 */
    const itemListBlock = findItemListBlockInEditor(editor, lineNum);
    if (itemListBlock) {
        const item = itemListBlock.item;
        if (itemListBlock.field.blockPrefix) {
            const expanded = expandItemListEditRange(itemListBlock, item);
            currentEditPos = { line: expanded.startLine, endLine: expanded.endLine };
            openDynamicModal(itemListBlock.item.name, expanded.mergedData);
        } else {
            currentEditPos = { line: itemListBlock.startLine, endLine: itemListBlock.endLine };
            openDynamicModal(itemListBlock.item.name, itemListBlock.itemListData);
        }
        return;
    }
}

/* ===== 条目列表字段渲染（动态模态框） ===== */

/* 存储当前条目列表数据 */
let _itemListData = {}; // { fieldIndex: [ { subFieldValues: [...] }, ... ] }

/* 渲染条目列表字段 */
function renderItemListField(field, fieldId, prefillData, fieldIndex) {
    const subFields = field.subFields || [];
    const itemTemplate = field.itemTemplate || '';
    
    /* 初始化数据 */
    if (!_itemListData[fieldIndex]) {
        _itemListData[fieldIndex] = [];
    }
    
    /* 如果有预填数据，使用预填数据 */
    if (prefillData && Array.isArray(prefillData) && prefillData.length > 0) {
        _itemListData[fieldIndex] = prefillData;
    } else if (_itemListData[fieldIndex].length === 0) {
        /* 添加一个空条目作为起始 */
        _itemListData[fieldIndex] = [{ subFieldValues: subFields.map(sf => sf.defaultValue || '') }];
    }
    
    let html = `<div class="form-group">
        <label>${escapeHtml(field.name)}</label>
        <div class="item-list-container" id="${fieldId}_container" data-field-index="${fieldIndex}" style="border: 1px solid #e0e0e0; border-radius: 6px; padding: 10px; background: #fafafa;">`;
    
    html += renderItemListItems(fieldIndex, subFields, itemTemplate);
    
    html += `</div>
        <button type="button" class="add-field-btn" onclick="addItemListItem(${fieldIndex})" style="margin-top: 8px;">+ 添加条目</button>
        <div style="font-size: 12px; color: #888; margin-top: 6px;">
            💡 每个条目会按模板生成一行，可自由添加/删除/排序
        </div>
    </div>`;
    
    return html;
}

/* 渲染条目列表中的所有条目 */
function renderItemListItems(fieldIndex, subFields, itemTemplate) {
    const items = _itemListData[fieldIndex] || [];
    if (items.length === 0) {
        return '<div class="empty-hint" style="padding: 10px; text-align: center; color: #aaa;">暂无条目，点击上方按钮添加</div>';
    }
    
    let html = '';
    items.forEach((item, itemIdx) => {
        const values = item.subFieldValues || subFields.map(() => '');
        html += `<div class="item-list-entry" data-item-idx="${itemIdx}" style="border: 1px solid #d0d0d0; border-radius: 6px; padding: 10px; margin-bottom: 8px; background: white; position: relative;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #eee;">
                <span style="font-weight: 600; font-size: 13px; color: #6a1b9a;"># ${itemIdx + 1}</span>
                <div style="display: flex; gap: 4px;">
                    <button type="button" onclick="moveItemListItem(${fieldIndex}, ${itemIdx}, -1)" class="multi-line-btn" title="上移" ${itemIdx === 0 ? 'style="opacity:0.3;pointer-events:none;"' : ''}>↑</button>
                    <button type="button" onclick="moveItemListItem(${fieldIndex}, ${itemIdx}, 1)" class="multi-line-btn" title="下移" ${itemIdx === items.length - 1 ? 'style="opacity:0.3;pointer-events:none;"' : ''}>↓</button>
                    <button type="button" onclick="removeItemListItem(${fieldIndex}, ${itemIdx})" class="multi-line-btn multi-line-btn-delete" title="删除">×</button>
                </div>
            </div>`;
        
        subFields.forEach((sf, sfIdx) => {
            const sfId = `${fieldIndex}_${itemIdx}_${sfIdx}`;
            const val = values[sfIdx] || '';
            const requiredMark = sf.required ? '<span style="color:#d32f2f;">*</span>' : '';
            const reqAttr = sf.required ? ' data-required="true"' : '';
            html += `<div style="margin-bottom: 6px; display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 12px; font-weight: 500; color: #555; min-width: 70px; flex-shrink: 0;">${escapeHtml(sf.name)}：${requiredMark}</span>`;
            
            if (sf.type === 'dropdown') {
                const options = sf.options ? sf.options.split('、') : [];
                html += `<select class="item-list-subfield"${reqAttr} data-field-index="${fieldIndex}" data-item-idx="${itemIdx}" data-sf-idx="${sfIdx}" style="flex: 1; padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px;">`;
                html += `<option value="">${escapeHtml(sf.placeholder || '请选择')}</option>`;
                options.forEach(opt => {
                    const parts = opt.split('|');
                    const optVal = parts.length === 2 ? parts[1].trim() : opt.trim();
                    const optLabel = parts.length === 2 ? parts[0].trim() : opt.trim();
                    html += `<option value="${escapeHtml(optVal)}" ${val === optVal ? 'selected' : ''}>${escapeHtml(optLabel)}</option>`;
                });
                html += `</select>`;
            } else if (sf.type === 'dropdown_custom') {
                const options = sf.options ? sf.options.split('、') : [];
                html += `<div style="flex:1;display:flex;gap:4px;flex-wrap:wrap;">`;
                html += `<select onchange="document.getElementById('${sfId}_input').value=this.value;document.getElementById('${sfId}_input').dispatchEvent(new Event('input'))" style="flex:1;min-width:80px;padding:4px 8px;border:1px solid #ccc;border-radius:4px;font-size:13px;">`;
                html += `<option value="">${escapeHtml(sf.placeholder || '请选择或输入')}</option>`;
                options.forEach(opt => {
                    const parts = opt.split('|');
                    const optVal = parts.length === 2 ? parts[1].trim() : opt.trim();
                    const optLabel = parts.length === 2 ? parts[0].trim() : opt.trim();
                    html += `<option value="${escapeHtml(optVal)}" ${val === optVal ? 'selected' : ''}>${escapeHtml(optLabel)}</option>`;
                });
                html += `</select>`;
                html += `<input type="text" id="${sfId}_input" class="item-list-subfield"${reqAttr} data-field-index="${fieldIndex}" data-item-idx="${itemIdx}" data-sf-idx="${sfIdx}" value="${escapeHtml(val)}" placeholder="${escapeHtml(sf.placeholder || '或直接输入')}" style="flex:2;min-width:100px;padding:4px 8px;border:1px solid #ccc;border-radius:4px;font-size:13px;">`;
                html += `</div>`;
            } else if (sf.type === 'checkbox') {
                const chkVal = sf.checkedValue || 'true';
                const unchkVal = sf.uncheckedValue || 'false';
                const isChecked = val === chkVal;
                html += `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;flex:1;">`;
                html += `<input type="checkbox" class="item-list-subfield"${reqAttr} data-field-index="${fieldIndex}" data-item-idx="${itemIdx}" data-sf-idx="${sfIdx}" data-checked-value="${escapeHtml(chkVal)}" data-unchecked-value="${escapeHtml(unchkVal)}" ${isChecked ? 'checked' : ''} onchange="this.dataset._val=this.checked?this.dataset.checkedValue:this.dataset.uncheckedValue" style="width:16px;height:16px;cursor:pointer;">`;
                html += `<span style="font-size:12px;color:#666;">${escapeHtml(sf.placeholder || '')}</span>`;
                html += `</label>`;
            } else if (sf.type === 'date') {
                html += `<input type="date" class="item-list-subfield"${reqAttr} data-field-index="${fieldIndex}" data-item-idx="${itemIdx}" data-sf-idx="${sfIdx}" value="${escapeHtml(val)}" style="flex:1;padding:4px 8px;border:1px solid #ccc;border-radius:4px;font-size:13px;">`;
            } else if (sf.type === 'number') {
                html += `<input type="number" class="item-list-subfield"${reqAttr} data-field-index="${fieldIndex}" data-item-idx="${itemIdx}" data-sf-idx="${sfIdx}" value="${escapeHtml(val)}" placeholder="${escapeHtml(sf.placeholder || '')}" style="flex: 1; padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px;">`;
            } else {
                html += `<input type="text" class="item-list-subfield"${reqAttr} data-field-index="${fieldIndex}" data-item-idx="${itemIdx}" data-sf-idx="${sfIdx}" value="${escapeHtml(val)}" placeholder="${escapeHtml(sf.placeholder || '')}" style="flex: 1; padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px;">`;
            }
            
            html += `</div>`;
        });
        
        html += '</div>';
    });
    
    return html;
}

/* 收集条目列表数据 */
function collectItemListData(fieldIndex) {
    const items = [];
    const container = document.querySelector(`#modal_field_${fieldIndex}_container`);
    if (!container) return items;
    
    const entries = container.querySelectorAll('.item-list-entry');
    const subFieldCount = container.querySelectorAll('.item-list-subfield').length / Math.max(entries.length, 1);
    
    entries.forEach(entry => {
        const inputs = entry.querySelectorAll('.item-list-subfield');
        const values = [];
        inputs.forEach(input => {
            if (input.type === 'checkbox') {
                const checkedVal = input.dataset.checkedValue || 'true';
                const uncheckedVal = input.dataset.uncheckedValue || 'false';
                values.push(input.checked ? checkedVal : uncheckedVal);
            } else {
                values.push(input.value);
            }
        });
        items.push({ subFieldValues: values });
    });
    
    return items;
}

/* 生成条目列表的输出文本 */
function generateItemListOutput(field) {
    const subFields = field.subFields || [];
    const itemTemplate = field.itemTemplate || '';
    const blockPrefix = field.blockPrefix || '';
    const blockSuffix = field.blockSuffix || '';
    
    /* 找到当前字段的 fieldIndex */
    const currentItem = currentModalConfig;
    if (!currentItem || !currentItem.modal || !currentItem.modal.fields) return '';
    const fieldIndex = currentItem.modal.fields.indexOf(field);
    if (fieldIndex === -1) return '';
    
    const items = collectItemListData(fieldIndex);
    if (items.length === 0) return '';
    
    const lines = [];
    if (blockPrefix) lines.push(blockPrefix);
    
    items.forEach(item => {
        const values = item.subFieldValues || [];
        let line = itemTemplate;
        values.forEach((val, idx) => {
            const placeholder = new RegExp(`\\{${idx + 1}\\}`, 'g');
            line = line.replace(placeholder, val);
        });
        lines.push(line);
    });
    
    if (blockSuffix) lines.push(blockSuffix);
    
    return lines.join('\n');
}

/* 添加条目列表中的条目 */
function addItemListItem(fieldIndex) {
    const item = currentModalConfig;
    const field = item.modal.fields[fieldIndex];
    if (!field || field.type !== 'item_list') return;
    
    /* 先把当前 DOM 中已填的值同步回来 */
    syncItemListFromDOM(fieldIndex);
    
    if (!_itemListData[fieldIndex]) {
        _itemListData[fieldIndex] = [];
    }
    
    const defaultValues = (field.subFields || []).map(sf => sf.defaultValue || '');
    _itemListData[fieldIndex].push({ subFieldValues: defaultValues });
    
    /* 重新渲染 */
    const container = document.getElementById(`modal_field_${fieldIndex}_container`);
    if (container) {
        container.innerHTML = renderItemListItems(fieldIndex, field.subFields || [], field.itemTemplate || '');
    }
}

/* 删除条目列表中的条目 */
function removeItemListItem(fieldIndex, itemIdx) {
    if (!_itemListData[fieldIndex]) return;
    if (_itemListData[fieldIndex].length <= 1) {
        showError('至少保留一个条目');
        return;
    }
    /* 先把当前 DOM 中已填的值同步回来 */
    syncItemListFromDOM(fieldIndex);
    
    _itemListData[fieldIndex].splice(itemIdx, 1);
    
    const item = currentModalConfig;
    const field = item.modal.fields[fieldIndex];
    const container = document.getElementById(`modal_field_${fieldIndex}_container`);
    if (container && field) {
        container.innerHTML = renderItemListItems(fieldIndex, field.subFields || [], field.itemTemplate || '');
    }
}

/* 移动条目列表中的条目 */
function moveItemListItem(fieldIndex, itemIdx, direction) {
    if (!_itemListData[fieldIndex]) return;
    const targetIdx = itemIdx + direction;
    if (targetIdx < 0 || targetIdx >= _itemListData[fieldIndex].length) return;
    
    /* 先把当前 DOM 中已填的值同步回来 */
    syncItemListFromDOM(fieldIndex);
    
    const temp = _itemListData[fieldIndex][itemIdx];
    _itemListData[fieldIndex][itemIdx] = _itemListData[fieldIndex][targetIdx];
    _itemListData[fieldIndex][targetIdx] = temp;
    
    const item = currentModalConfig;
    const field = item.modal.fields[fieldIndex];
    const container = document.getElementById(`modal_field_${fieldIndex}_container`);
    if (container && field) {
        container.innerHTML = renderItemListItems(fieldIndex, field.subFields || [], field.itemTemplate || '');
    }
}

/* 从 DOM 同步条目列表数据到 _itemListData */
function syncItemListFromDOM(fieldIndex) {
    const values = collectItemListData(fieldIndex);
    if (values.length > 0) {
        _itemListData[fieldIndex] = values;
    }
}

/* 从编辑器中解析条目列表块 */
function findItemListBlockInEditor(cm, lineNum) {
    if (!toolsConfig || !toolsConfig.categories) return null;
    
    /* 辅助：为指定 item.field 在编辑器中定位并解析块 */
    function _tryMatch(item, field, cm, lineNum) {
        const blockPrefix = field.blockPrefix || '';
        const blockSuffix = field.blockSuffix || '';
        if (!blockPrefix && !blockSuffix) return null;
        
        const subFields = field.subFields || [];
        const itemTemplate = field.itemTemplate || '';
        if (!itemTemplate || subFields.length === 0) return null;
        
        const totalLines = cm.lineCount();
        const templateLines = itemTemplate.split('\n');
        const linesPerItem = templateLines.length;
        
        /* 构建条目正则 */
        let itemRegex = null;
        try {
            let rawPattern = itemTemplate;
            subFields.forEach((sf, idx) => {
                const ph = `{${idx + 1}}`;
                const isLast = idx === subFields.length - 1;
                rawPattern = rawPattern.replace(ph, isLast ? '___CAPTURE_LAST___' : '___CAPTURE___');
            });
            let escaped = rawPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            escaped = escaped.replace(/___CAPTURE___/g, '(.+?)');
            escaped = escaped.replace(/___CAPTURE_LAST___/g, '(.+)');
            itemRegex = new RegExp('^' + escaped + '\\s*$');
        } catch (e) { return null; }
        
        let startLine = -1, endLine = -1;
        
        /* ---- 有 blockPrefix：先定位前缀行，再找后缀 ---- */
        if (blockPrefix) {
            for (let i = lineNum; i < totalLines; i++) {
                if (cm.getLine(i).trim() === blockPrefix) { startLine = i; break; }
                if (i > lineNum + 20) break;
            }
            if (startLine === -1) {
                for (let i = lineNum - 1; i >= 0; i--) {
                    if (cm.getLine(i).trim() === blockPrefix) { startLine = i; break; }
                    if (i < lineNum - 20) break;
                }
            }
            if (startLine === -1) return null;
            
            for (let i = Math.max(lineNum, startLine); i < totalLines; i++) {
                if (blockSuffix && cm.getLine(i).trim() === blockSuffix) { endLine = i; break; }
                if (i > startLine + 50) break;
            }
            if (endLine === -1) return null;
            
            const items = _parseItemListLines(cm, startLine + 1, endLine, linesPerItem, itemRegex, subFields);
            if (items.length === 0) return null;
            
            const fieldIndex = item.modal.fields.indexOf(field);
            return { item, field, startLine, endLine, itemListData: { [fieldIndex]: items } };
        }
        
        /* ---- 无 blockPrefix，只有 blockSuffix：靠后缀锚定，反向解析 ---- */
        if (blockSuffix) {
            for (let i = lineNum; i < totalLines && i <= lineNum + 50; i++) {
                if (cm.getLine(i).trim() === blockSuffix) { endLine = i; break; }
            }
            if (endLine === -1) {
                for (let i = lineNum - 1; i >= 0 && i >= lineNum - 50; i--) {
                    if (cm.getLine(i).trim() === blockSuffix) { endLine = i; break; }
                }
            }
            if (endLine === -1) return null;
            
            /* 反向解析条目 */
            const items = [];
            let ptr = endLine - 1;
            while (ptr - linesPerItem + 1 >= 0) {
                const groupLines = [];
                for (let i = ptr - linesPerItem + 1; i <= ptr; i++) groupLines.push(cm.getLine(i));
                const combinedText = groupLines.join('\n');
                if (!combinedText.trim()) break;
                try {
                    const match = combinedText.match(itemRegex);
                    if (match) {
                        const vals = [];
                        subFields.forEach((sf, idx) => vals.push((match[idx + 1] || '').trim()));
                        items.unshift({ subFieldValues: vals });
                        ptr -= linesPerItem;
                        continue;
                    }
                } catch (e) {}
                break;
            }
            if (items.length === 0) return null;
            
            const fieldIndex3 = item.modal.fields.indexOf(field);
            
            /* 向下扫描尾随输出行：blockSuffix 之后的模板尾随行也应纳入替换范围 */
            const outputTemplate = item.modal.output || '';
            if (outputTemplate) {
                const ilPh = `{${fieldIndex3 + 1}}`;
                const ilPos = outputTemplate.indexOf(ilPh);
                if (ilPos >= 0) {
                    const trailingPart = outputTemplate.substring(ilPos + ilPh.length);
                    /* 统计模板中尾随的非空行数量 */
                    const trailingNonEmptyCount = trailingPart.split('\n').filter(l => l.trim()).length;
                    let scanForward = endLine + 1;
                    let matchedNonEmpty = 0;
                    while (scanForward < totalLines && matchedNonEmpty < trailingNonEmptyCount) {
                        if (cm.getLine(scanForward).trim()) matchedNonEmpty++;
                        endLine = scanForward;
                        scanForward++;
                    }
                }
            }
            
            startLine = ptr + 1;
            const prefillMap = { [fieldIndex3]: items };
            
            /* 向上扫描前置常规字段 */
            if (outputTemplate) {
                const outLines = outputTemplate.split('\n');
                let scanLine = startLine - 1;
                while (scanLine >= 0) {
                    const prevLine = cm.getLine(scanLine);
                    if (!prevLine.trim()) { scanLine--; continue; }
                    let lineMatched = false;
                    for (const tmplLine of outLines) {
                        /* 跳过纯占位符行（如{2}），它代表条目列表输出，通配任何行，会导致贪心横扫 */
                        const stripped = tmplLine.replace(/\{\d+\}/g, '').trim();
                        if (!stripped) continue;
                        const phMatches = [];
                        let m; const phRegex = /\{(\d+)\}/g;
                        while ((m = phRegex.exec(tmplLine)) !== null) phMatches.push(parseInt(m[1]));
                        if (phMatches.length === 0) {
                            /* 无占位符的行（如 @Skip false）：按字面精确匹配，匹配则视为同一块继续扫描 */
                            if (prevLine.trim() === tmplLine.trim()) {
                                lineMatched = true;
                            }
                            continue;
                        }
                        let rawPattern = tmplLine;
                        phMatches.forEach((ph, idx) => {
                            rawPattern = rawPattern.replace(`{${ph}}`, idx === phMatches.length - 1 ? '___CAPTURE_LAST___' : '___CAPTURE___');
                        });
                        let escaped = rawPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        escaped = escaped.replace(/___CAPTURE___/g, '(.+?)').replace(/___CAPTURE_LAST___/g, '(.+)');
                        try {
                            const regex = new RegExp('^' + escaped + '\\s*$');
                            const match = prevLine.trim().match(regex);
                            if (match) {
                                let fieldIdxAccum = 0;
                                item.modal.fields.forEach((f, idx2) => {
                                    if (f.type === 'item_list') return;
                                    fieldIdxAccum++;
                                    const phOrder = phMatches.indexOf(fieldIdxAccum);
                                    if (phOrder >= 0 && match[phOrder + 1] !== undefined) {
                                        let val = match[phOrder + 1].trim().replace(/^"(.*)"$/, '$1');
                                        prefillMap[idx2] = val;
                                    }
                                });
                                lineMatched = true;
                            }
                        } catch (e) {}
                        if (lineMatched) break;
                    }
                    if (lineMatched) { startLine = scanLine; scanLine--; } else break;
                }
            }
            return { item, field, startLine, endLine, itemListData: prefillMap };
        }
        return null;
    }
    
    /* ===== 第一轮：只匹配有 blockPrefix 的工具（精确匹配，优先返回） ===== */
    for (const category of toolsConfig.categories) {
        for (const item of category.items) {
            if (item.type !== 'modal' || !item.modal || !item.modal.fields) continue;
            for (const field of item.modal.fields) {
                if (field.type !== 'item_list') continue;
                if (!field.blockPrefix) continue;  /* 跳过无前缀的，留到第二轮 */
                const result = _tryMatch(item, field, cm, lineNum);
                if (result) return result;
            }
        }
    }
    
    /* ===== 第二轮：只匹配无 blockPrefix 但只有 blockSuffix 的工具 ===== */
    for (const category of toolsConfig.categories) {
        for (const item of category.items) {
            if (item.type !== 'modal' || !item.modal || !item.modal.fields) continue;
            for (const field of item.modal.fields) {
                if (field.type !== 'item_list') continue;
                if (field.blockPrefix) continue;   /* 有前缀的已经在第一轮扫过 */
                if (!field.blockSuffix) continue;
                const result = _tryMatch(item, field, cm, lineNum);
                if (result) return result;
            }
        }
    }
    
    return null;
}

/* 辅助函数：解析 startLine（不含）到 endLine（不含）之间的行，按 linesPerItem 分组匹配 */
function _parseItemListLines(cm, fromLine, toLine, linesPerItem, itemRegex, subFields) {
    const items = [];
    const rawLines = [];
    for (let i = fromLine; i < toLine; i++) {
        const text = cm.getLine(i);
        if (text.trim()) rawLines.push(text);
    }
    if (rawLines.length === 0) return items;
    
    for (let g = 0; g + linesPerItem <= rawLines.length; g += linesPerItem) {
        const groupLines = rawLines.slice(g, g + linesPerItem);
        const combinedText = groupLines.join('\n');
        if (!combinedText.trim()) continue;
        
        const subFieldValues = [];
        try {
            const match = combinedText.match(itemRegex);
            if (match) {
                subFields.forEach((sf, idx) => {
                    subFieldValues.push((match[idx + 1] || '').trim());
                });
            }
        } catch (e) {}
        
        /* fallback：取首行文本作为第一个子字段值 */
        if (subFieldValues.length !== subFields.length) {
            const firstLine = groupLines[0].trim();
            subFieldValues.length = 0;
            subFields.forEach((sf, idx) => {
                subFieldValues.push(idx === 0 ? firstLine : '');
            });
        }
        
        items.push({ subFieldValues });
    }
    return items;
}

/* 处理可编辑下拉框值变更 */
function handleSelectableChange(fieldId, value) {
    const selectEl = document.getElementById(fieldId + '_select');
    const inputEl = document.getElementById(fieldId);

    if (value === '__custom__') {
        selectEl.style.display = 'none';
        showCustomInputModal(fieldId);
    } else {
        inputEl.value = value;
    }
}

/* 弹出自定义输入弹窗 */
function showCustomInputModal(fieldId) {
    const modal = document.createElement('div');
    modal.id = 'customInputModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 450px;">
            <div class="modal-header">
                <h3>自定义选项</h3>
                <span class="close" onclick="closeCustomInputModal()">&times;</span>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>显示文本（下拉菜单中显示的名称）</label>
                    <input type="text" id="customLabelInput" placeholder="如：艾玛（Ema）">
                </div>
                <div class="form-group">
                    <label>实际值（插入脚本中的内容）</label>
                    <input type="text" id="customValueInput" placeholder="如：Ema">
                </div>
                <div style="font-size: 12px; color: #6a1b9a; margin-top: 8px; padding: 8px; background: #faf5ff; border-radius: 4px;">
                    💡 <strong>提示：</strong>如果只填写实际值，系统会同时作为显示文本保存。
                </div>
            </div>
            <div class="modal-footer">
                <button class="modal-btn modal-btn-secondary" onclick="closeCustomInputModal()">取消</button>
                <button class="modal-btn modal-btn-primary" onclick="submitCustomInput('${fieldId}')">确定</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.classList.add('show');
}

/* 关闭自定义输入弹窗 */
function closeCustomInputModal() {
    const modal = document.getElementById('customInputModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    }
}

/* 提交自定义输入值 */
function submitCustomInput(fieldId) {
    const label = document.getElementById('customLabelInput').value.trim();
    const value = document.getElementById('customValueInput').value.trim();

    const inputEl = document.getElementById(fieldId);

    if (!value) {
        showError('请至少填写实际值！');
        return;
    }

    const optionStr = label && label !== value ? `${label}|${value}` : value;
    inputEl.value = value;

    const selectEl = document.getElementById(fieldId + '_select');
    if (selectEl) {
        selectEl.style.display = 'none';
    }
    inputEl.style.display = 'block';

    const currentItem = currentModalConfig;
    const fieldIndex = fieldId.replace('modal_field_', '');
    const field = currentItem.modal.fields[parseInt(fieldIndex)];

    if (field && currentItem.name) {
        saveCustomOption(currentItem.name, field.name, optionStr);
    }

    closeCustomInputModal();
}

/* 获取已保存的自定义选项 */
function getCustomOptions(itemName, fieldName) {
    const cookieKey = `custom_options_${encodeURIComponent(itemName)}_${encodeURIComponent(fieldName)}`;
    const cookieValue = getCookie(cookieKey);
    if (!cookieValue) return [];
    try {
        return JSON.parse(cookieValue);
    } catch {
        return [];
    }
}

/* 保存自定义选项到 Cookie */
function saveCustomOption(itemName, fieldName, optionValue) {
    if (!optionValue || !optionValue.trim()) return;

    const cookieKey = `custom_options_${encodeURIComponent(itemName)}_${encodeURIComponent(fieldName)}`;
    const existingOptions = getCustomOptions(itemName, fieldName);

    const normalizedValue = optionValue.trim();
    if (existingOptions.includes(normalizedValue)) return;

    existingOptions.push(normalizedValue);
    setCookie(cookieKey, JSON.stringify(existingOptions), 365);
}

/* 提交动态模态框：收集字段值并生成输出脚本 */
function submitDynamicModal() {
    if (!currentModalConfig) return;

    const fieldValues = [];
    const fieldActive = [];
    let hasError = false;

    document.querySelectorAll('.form-group input, .form-group select').forEach(el => {
        el.style.borderColor = '';
        el.style.borderWidth = '';
        el.setAttribute('title', '');
    });
    /* 重置条目列表的错误样式 */
    document.querySelectorAll('.item-list-container').forEach(el => {
        el.style.borderColor = '';
        el.style.borderWidth = '';
        el.removeAttribute('title');
    });
    document.querySelectorAll('.item-list-entry').forEach(el => {
        el.style.borderColor = '';
        el.style.borderWidth = '';
    });
    document.querySelectorAll('.item-list-subfield').forEach(el => {
        el.style.borderColor = '';
        el.style.borderWidth = '';
        el.removeAttribute('title');
    });

    currentModalConfig.modal.fields.forEach((field, index) => {
        const fieldElement = document.getElementById(`modal_field_${index}`);
        
        /* 条目列表特殊处理 */
        if (field.type === 'item_list') {
            /* 先同步 DOM 数据 */
            syncItemListFromDOM(index);
            const blockText = generateItemListOutput(field);
            
            /* 校验条目列表字段本身是否必填 */
            if (field.required && !blockText) {
                const container = document.getElementById(`modal_field_${index}_container`);
                if (container) {
                    container.style.borderColor = '#ff0000';
                    container.style.borderWidth = '2px';
                    container.setAttribute('title', `请添加至少一个条目`);
                }
                hasError = true;
            }
            
            /* 校验子字段必填 */
            const items = _itemListData[index] || [];
            const subFields = field.subFields || [];
            items.forEach((item, itemIdx) => {
                const values = item.subFieldValues || [];
                subFields.forEach((sf, sfIdx) => {
                    if (sf.required) {
                        const val = (values[sfIdx] || '').trim();
                        if (!val) {
                            /* 标记对应的输入框 */
                            const entryEl = document.querySelector(`#modal_field_${index}_container .item-list-entry[data-item-idx="${itemIdx}"]`);
                            if (entryEl) {
                                entryEl.style.borderColor = '#ff0000';
                                entryEl.style.borderWidth = '2px';
                            }
                            const input = document.querySelector(`.item-list-subfield[data-field-index="${index}"][data-item-idx="${itemIdx}"][data-sf-idx="${sfIdx}"]`);
                            if (input) {
                                input.style.borderColor = '#ff0000';
                                input.setAttribute('title', `请填写 ${sf.name}`);
                            }
                            hasError = true;
                        }
                    }
                });
            });
            
            fieldValues.push(blockText);
            fieldActive.push(!!blockText);
            return;
        }
        
        if (fieldElement) {
            let value = '';
            let active = false;

            if (field.type === 'checkbox') {
                if (fieldElement.checked) {
                    value = fieldElement.value;
                    active = true;
                } else {
                    const uncheckedInput = document.getElementById(`modal_field_${index}_unchecked`);
                    value = uncheckedInput ? uncheckedInput.value : 'false';
                    active = false;
                }
            } else if (field.type === 'selectable' || field.type === 'dropdown_custom') {
                const selectEl = document.getElementById(`modal_field_${index}_select`);
                if (selectEl && selectEl.style.display !== 'none' && selectEl.value) {
                    value = selectEl.value;
                } else {
                    value = fieldElement.value;
                }
                active = !!(value && value.trim());
            } else {
                value = fieldElement.value;
                active = !!(value && value.trim());
            }

            if (field.required && !value.trim()) {
                if (field.type === 'selectable' || field.type === 'dropdown_custom') {
                    const selectEl = document.getElementById(`modal_field_${index}_select`);
                    if (selectEl && selectEl.style.display !== 'none') {
                        selectEl.style.borderColor = '#ff0000';
                        selectEl.setAttribute('title', `请填写 ${field.name}`);
                    } else {
                        fieldElement.style.borderColor = '#ff0000';
                        fieldElement.setAttribute('title', `请填写 ${field.name}`);
                    }
                } else {
                    fieldElement.style.borderColor = '#ff0000';
                    fieldElement.setAttribute('title', `请填写 ${field.name}`);
                }
                hasError = true;
            }

            fieldValues.push(value);
            fieldActive.push(active);

            if ((field.type === 'selectable' || field.type === 'dropdown_custom') && value && value.trim()) {
                const selectEl = document.getElementById(`modal_field_${index}_select`);
                if (selectEl && selectEl.style.display === 'none') {
                    saveCustomOption(currentModalConfig.name, field.name, value);
                }
            }
        }
    });

    if (hasError) {
        showError('请填写必填项（标红字段）');
        return;
    }

    let output = currentModalConfig.modal.output;
    const fields = currentModalConfig.modal.fields;

    const hasOptionalFields = fields.some(f => f.fieldCategory === 'optional');

    if (hasOptionalFields) {
        /* 可选字段处理：必填字段使用 {1}{2}... 顺序替换主模板，可选字段使用独立 outputTemplate 追加 */
        let requiredCount = 0;
        const parts = [];

        let baseOutput = output;
        fields.forEach((field, index) => {
            if (field.fieldCategory !== 'optional') {
                requiredCount++;
                const placeholder = `{${requiredCount}}`;
                baseOutput = baseOutput.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), fieldValues[index]);
            }
        });
        /* 将必填字段替换后的主模板放入第一部分 */
        parts.push(baseOutput);

        /* 将有值的可选字段按 outputTemplate 模板用 {N}→实际值 替换后追加 */
        fields.forEach((field, index) => {
            if (field.fieldCategory === 'optional') {
                if (fieldActive[index]) {
                    let fieldOutput = field.outputTemplate || '';
                    if (fieldOutput) {
                        fieldOutput = fieldOutput.replace(/\{N\}/g, fieldValues[index]);
                        parts.push(fieldOutput);
                    } else {
                        parts.push(`${fieldValues[index]}`);
                    }
                }
            }
        });

        output = parts.join(' ');
    } else {
        fieldValues.forEach((value, index) => {
            const placeholder = `{${index + 1}}`;
            output = output.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
        });
    }

    if (currentEditPos !== null) {
        const lineNum = currentEditPos.line;
        const endLine = currentEditPos.endLine !== undefined ? currentEditPos.endLine : lineNum;
        const from = { line: lineNum, ch: 0 };
        const to = { line: endLine, ch: editor.getLine(endLine).length };
        editor.getDoc().replaceRange(output, from, to);
        const newPos = { line: lineNum, ch: output.length };
        editor.getDoc().setCursor(newPos);
        currentEditPos = null;
    } else {
        insertSnippet(output, currentModalConfig.inlineInsert);
    }
    closeModal('dynamicModal');
}

/* 处理工具点击事件（Shift+点击插入默认模板） */
function handleToolClick(itemName, directOutput = null) {
    if (isShiftPressed) {
        insertDefaultSnippet(itemName);
    } else if (directOutput) {
        /* 查找工具的 inlineInsert 标志 */
        let inlineInsert = false;
        for (const cat of toolsConfig.categories) {
            const found = cat.items.find(i => i.name === itemName);
            if (found) { inlineInsert = found.inlineInsert; break; }
        }
        insertSnippet(directOutput, inlineInsert);
    } else {
        /* 检查是否为多行编辑工具 */
        const category = toolsConfig.categories.find(c =>
            c.items.some(item => item.name === itemName)
        );
        if (category) {
            const item = category.items.find(i => i.name === itemName);
            if (item && item.multiLineEdit) {
                openMultiLineModal(item);
                return;
            }
        }
        openDynamicModal(itemName);
    }
}

/* 查找编辑器中匹配模式的所有行及其值 */
function findMatchingLines(pattern) {
    if (!editor || !pattern) return [];
    const lines = [];
    const totalLines = editor.lineCount();
    for (let i = 0; i < totalLines; i++) {
        const lineText = editor.getLine(i);
        if (lineText.indexOf(pattern) !== -1) {
            lines.push({ lineNum: i, text: lineText });
        }
    }
    return lines;
}

/* 打开多行编辑弹窗 */
function openMultiLineModal(item) {
    const modalTitle = document.getElementById('dynamicModalTitle');
    const modalBody = document.getElementById('dynamicModalBody');
    const modalFooter = document.getElementById('dynamicModalFooter');

    modalTitle.textContent = item.modal?.title || item.name;

    const matchPattern = item.matchPattern || '';
    const lineTemplate = item.lineTemplate || '';

    /* 从编辑器中提取匹配行 */
    let matchedLines = findMatchingLines(matchPattern);

    /* 存储当前工具信息和匹配行引用 */
    window._multiLineEditData = {
        item: item,
        matchedLines: matchedLines,
        lineTemplate: lineTemplate,
        matchPattern: matchPattern
    };

    /* 构建编辑器中的上下文信息 */
    let contextInfo = '';
    if (matchedLines.length > 0) {
        contextInfo = `<div style="font-size:12px;color:#888;margin-bottom:12px;">
            已从编辑器中识别到 ${matchedLines.length} 个匹配条目
        </div>`;
    } else {
        contextInfo = `<div style="font-size:12px;color:#e65100;margin-bottom:12px;">
            未在编辑器中找到匹配「${escapeHtml(matchPattern)}」的行，将创建新列表
        </div>`;
    }

    let bodyHtml = contextInfo + '<div class="multi-line-list" id="multiLineList">';

    matchedLines.forEach((line, idx) => {
        /* 提取值：从匹配行中去掉匹配模式前缀 */
        let value = line.text;
        if (matchPattern) {
            const patternIdx = line.text.indexOf(matchPattern);
            if (patternIdx !== -1) {
                value = line.text.substring(patternIdx + matchPattern.length);
            }
        }
        bodyHtml += buildMultiLineRow(idx, value);
    });

    bodyHtml += '</div>';

    bodyHtml += `
        <button class="add-field-btn" onclick="addMultiLineRow()" style="margin-top:10px;">+ 添加条目</button>
    `;

    modalBody.innerHTML = bodyHtml;
    modalFooter.innerHTML = `
        <button class="modal-btn modal-btn-secondary" onclick="resetMultiLineModal()">重置</button>
        <button class="modal-btn" onclick="closeModal('dynamicModal')">取消</button>
        <button class="modal-btn modal-btn-primary" onclick="submitMultiLineModal()">保存</button>
    `;

    showModal('dynamicModal');
}

/* 构建多行编辑器的单行 */
function buildMultiLineRow(idx, value) {
    return `
        <div class="multi-line-row" data-idx="${idx}">
            <span class="multi-line-drag">☰</span>
            <input type="text" class="multi-line-input" value="${escapeHtml(value)}" placeholder="输入值">
            <button class="multi-line-btn" onclick="moveMultiLineUp(this)" title="上移">↑</button>
            <button class="multi-line-btn" onclick="moveMultiLineDown(this)" title="下移">↓</button>
            <button class="multi-line-btn multi-line-btn-delete" onclick="deleteMultiLineRow(this)" title="删除">×</button>
        </div>
    `;
}

/* 添加一个新的多行条目 */
function addMultiLineRow() {
    const list = document.getElementById('multiLineList');
    if (!list) return;
    const rows = list.querySelectorAll('.multi-line-row');
    const newIdx = rows.length;
    const rowHtml = buildMultiLineRow(newIdx, '');
    list.insertAdjacentHTML('beforeend', rowHtml);
    /* 聚焦新行输入框 */
    const newRow = list.querySelector(`.multi-line-row[data-idx="${newIdx}"]`);
    if (newRow) {
        const input = newRow.querySelector('.multi-line-input');
        if (input) input.focus();
    }
}

/* 删除多行条目 */
function deleteMultiLineRow(btn) {
    const row = btn.closest('.multi-line-row');
    if (!row) return;
    const list = document.getElementById('multiLineList');
    if (!list) return;
    row.remove();
    /* 重新编号 */
    reindexMultiLineRows(list);
}

/* 上移条目 */
function moveMultiLineUp(btn) {
    const row = btn.closest('.multi-line-row');
    if (!row) return;
    const prev = row.previousElementSibling;
    if (prev && prev.classList.contains('multi-line-row')) {
        row.parentNode.insertBefore(row, prev);
        const list = document.getElementById('multiLineList');
        if (list) reindexMultiLineRows(list);
    }
}

/* 下移条目 */
function moveMultiLineDown(btn) {
    const row = btn.closest('.multi-line-row');
    if (!row) return;
    const next = row.nextElementSibling;
    if (next && next.classList.contains('multi-line-row')) {
        row.parentNode.insertBefore(next, row);
        const list = document.getElementById('multiLineList');
        if (list) reindexMultiLineRows(list);
    }
}

/* 重新编号多行条目 */
function reindexMultiLineRows(list) {
    const rows = list.querySelectorAll('.multi-line-row');
    rows.forEach((row, idx) => {
        row.setAttribute('data-idx', idx);
    });
}

/* 重置多行弹窗为编辑器原始状态 */
function resetMultiLineModal() {
    const data = window._multiLineEditData;
    if (!data) return;

    const list = document.getElementById('multiLineList');
    if (!list) return;

    const matchPattern = data.matchPattern;
    let html = '';
    data.matchedLines.forEach((line, idx) => {
        let value = line.text;
        if (matchPattern) {
            const patternIdx = line.text.indexOf(matchPattern);
            if (patternIdx !== -1) {
                value = line.text.substring(patternIdx + matchPattern.length);
            }
        }
        html += buildMultiLineRow(idx, value);
    });
    list.innerHTML = html;
}

/* 提交多行编辑 */
function submitMultiLineModal() {
    const data = window._multiLineEditData;
    if (!data) return;

    const list = document.getElementById('multiLineList');
    if (!list) return;

    const inputs = list.querySelectorAll('.multi-line-input');
    const lineTemplate = data.lineTemplate;
    const matchPattern = data.matchPattern;
    const item = data.item;

    /* 收集所有条目的值 */
    const values = [];
    inputs.forEach(input => {
        const val = input.value;
        if (val !== undefined && val !== null) {
            values.push(val);
        }
    });

    /* 生成输出文本 */
    let outputLines = [];
    values.forEach(val => {
        if (lineTemplate) {
            outputLines.push(lineTemplate.replace(/\{N\}/g, val));
        } else {
            outputLines.push(val);
        }
    });
    let output = outputLines.join('\n');

    /* 替换编辑器中的匹配行 */
    const matchedLines = data.matchedLines;
    if (matchedLines.length > 0) {
        /* 有已有的匹配行：替换整个块 */
        const firstLine = matchedLines[0].lineNum;
        const lastLine = matchedLines[matchedLines.length - 1].lineNum;

        /* 检查匹配块前后是否有空白行需要处理 */
        const from = { line: firstLine, ch: 0 };
        const to = { line: lastLine, ch: editor.getLine(lastLine).length };

        editor.getDoc().replaceRange(output, from, to);
        editor.setCursor({ line: firstLine, ch: 0 });
    } else {
        /* 新插入 */
        if (output) {
            insertSnippet(output, data.item.inlineInsert);
        } else {
            closeModal('dynamicModal');
            return;
        }
    }

    focusEditor();
    localStorage.setItem('editorAutoSave', editor.getValue());
    closeModal('dynamicModal');
    showSuccess('多行条目已保存！');
}

/* Shift 键按下时显示快捷输入提示 */
function handleShiftKeyDown(event) {
    if (event.key === 'Shift') {
        isShiftPressed = true;
        const shiftHint = document.getElementById('shiftHint');
        if (shiftHint) {
            shiftHint.classList.add('show');
        }
    }
}

/* Shift 键释放时隐藏快捷输入提示 */
function handleShiftKeyUp(event) {
    if (event.key === 'Shift') {
        isShiftPressed = false;
        const shiftHint = document.getElementById('shiftHint');
        if (shiftHint) {
            shiftHint.classList.remove('show');
        }
    }
}

/* 创建 Shift 快捷输入悬浮提示 */
function createShiftHint() {
    const hint = document.createElement('div');
    hint.id = 'shiftHint';
    hint.className = 'shift-hint';
    hint.innerHTML = `
        <span class="shift-icon">⇧</span>
        <span class="shift-text">快捷输入模式 - Shift键已按下，点击工具直接插入默认模板</span>
    `;
    document.body.appendChild(hint);
}

/* 插入工具默认模板（Shift+点击） */
function insertDefaultSnippet(itemName) {
    const category = toolsConfig.categories.find(c =>
        c.items.some(item => item.name === itemName)
    );
    if (!category) return;

    const item = category.items.find(i => i.name === itemName);
    if (!item) return;

    let output = '';

    if (item.type === 'direct') {
        output = item.output;
    } else if (item.type === 'modal' && item.modal) {
        output = item.modal.output;

        if (item.modal.fields) {
            item.modal.fields.forEach((field, index) => {
                const placeholder = `{${index + 1}}`;
                const fieldLabel = field.label || field.name || `字段${index + 1}`;
                output = output.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), `[${fieldLabel}]`);
            });
        }
    }

    if (output) {
        insertSnippet(output, item.inlineInsert);
    }
}

/* 解析快捷键字符串为结构化对象 */
function parseShortcut(shortcutStr) {
    if (!shortcutStr) return null;

    const parts = shortcutStr.toUpperCase().split('+');
    if (parts.length < 2) return null;

    const modifiers = [];
    let key = '';

    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i].trim();
        if (part === 'CTRL' || part === 'CONTROL') modifiers.push('Ctrl');
        else if (part === 'ALT') modifiers.push('Alt');
        else if (part === 'SHIFT') modifiers.push('Shift');
    }

    key = parts[parts.length - 1].trim();

    if (modifiers.length === 0 || !key) return null;

    return { modifiers: modifiers.sort(), key };
}

/* 全局键盘事件监听：匹配快捷键执行工具 */
function handleGlobalKeydown(event) {
    if (!toolsConfig || !toolsConfig.categories) return;

    const key = event.key.toUpperCase();
    const modifiers = [];
    if (event.ctrlKey) modifiers.push('Ctrl');
    if (event.altKey) modifiers.push('Alt');
    if (event.shiftKey) modifiers.push('Shift');

    if (modifiers.length === 0) return;

    const sortedModifiers = modifiers.sort();

    for (const category of toolsConfig.categories) {
        for (const item of category.items) {
            if (!item.shortcut) continue;

            const shortcut = parseShortcut(item.shortcut);
            if (!shortcut) continue;

            if (shortcut.modifiers.join(',') === sortedModifiers.join(',') && shortcut.key === key) {
                event.preventDefault();

                if (item.type === 'modal') {
                    openDynamicModal(item.name);
                } else if (item.type === 'direct') {
                    insertSnippet(item.output, item.inlineInsert);
                }
                return;
            }
        }
    }
}

/* 构建工具悬浮提示文本 */
function buildItemTooltip(item) {
    let tooltip = '';

    if (item.type === 'modal' && item.modal) {
        if (item.modal.description) {
            const descDiv = document.createElement('div');
            descDiv.innerHTML = item.modal.description;
            tooltip += descDiv.innerText || descDiv.textContent || '';
        }
        if (item.modal.fields && item.modal.fields.length > 0) {
            const fieldNames = item.modal.fields.map(f => f.name).join(', ');
            if (tooltip) tooltip += '\n';
            tooltip += `字段: ${fieldNames}`;
        }
    } else if (item.type === 'direct') {
        tooltip = item.output || '';
    }

    if (item.shortcut) {
        if (tooltip) tooltip += '\n';
        tooltip += `快捷键：${item.shortcut}`;
    }

    return escapeHtml(tooltip).replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
}

/* 在配置中查找命令对应的工具列表（支持重载） */
function findCommandsInConfig(cmd) {
    if (!toolsConfig || !toolsConfig.categories) return [];

    const cmdLower = cmd.toLowerCase();
    const results = [];

    for (const category of toolsConfig.categories) {
        for (const item of category.items) {
            let output = '';
            if (item.type === 'modal' && item.modal && item.modal.output) {
                output = item.modal.output;
            } else if (item.type === 'direct' && item.output) {
                output = item.output;
            }

            if (output) {
                const outputCmdMatch = output.match(/^@(\w+)/i);
                if (outputCmdMatch && outputCmdMatch[1].toLowerCase() === cmdLower) {
                    results.push({
                        typeText: item.name,
                        categoryName: category.name,
                        icon: item.icon || '',
                        output: output,
                        item: item
                    });
                }
            }

            /* 条目列表工具：检查 itemTemplate、blockPrefix、blockSuffix 中的命令 */
            if (item.type === 'modal' && item.modal && item.modal.fields) {
                item.modal.fields.forEach(field => {
                    if (field.type !== 'item_list') return;
                    const linesToCheck = [];
                    if (field.blockPrefix) linesToCheck.push(field.blockPrefix);
                    if (field.blockSuffix) linesToCheck.push(field.blockSuffix);
                    if (field.itemTemplate) {
                        field.itemTemplate.split('\n').forEach(l => {
                            if (l.trim()) linesToCheck.push(l.trim());
                        });
                    }
                    linesToCheck.forEach(line => {
                        const match = line.match(/^@(\w+)/i);
                        if (match && match[1].toLowerCase() === cmdLower) {
                            results.push({
                                typeText: item.name,
                                categoryName: category.name,
                                icon: item.icon || '',
                                output: line,
                                item: item
                            });
                        }
                    });
                });
            }
        }
    }

    return results;
}

/* 在配置中查找命令并确定最佳匹配（含重载选择） */
function findCommandInConfig(cmd, fullLine) {
    const results = findCommandsInConfig(cmd);
    if (results.length === 0) return null;

    if (results.length === 1) {
        return {
            typeText: results[0].typeText,
            contentText: fullLine ? fullLine.substring(cmd.length + 1).trim() : ''
        };
    }

    const overloads = results.map(r => ({
        name: r.typeText,
        categoryName: r.categoryName,
        params: [],
        output: r.output,
        type: '',
        icon: r.icon
    }));

    const sorted = findBestOverloadMatch(overloads, fullLine || '');

    const bestMatch = results.find(r => r.typeText === sorted[0].name);

    return {
        typeText: bestMatch ? bestMatch.typeText : results[0].typeText,
        contentText: fullLine ? fullLine.substring(cmd.length + 1).trim() : '',
        overloads: results
    };
}

/* 解析行内容中的字段值用于回填编辑 */
function parseLineFieldValues(lineText, configItem) {
    if (!lineText || !configItem || !configItem.modal || !configItem.modal.fields) return {};
    const output = configItem.modal.output;
    const fields = configItem.modal.fields;
    const parsedValues = {};

    if (!output) return parsedValues;

    /* 提取输出中的 @命令前缀，用于行匹配 */
    const outputCmdMatch = output.match(/^(@\w+\s*)/);
    if (!outputCmdMatch) return parsedValues;
    const outputBody = output.substring(outputCmdMatch[1].length);

    /* 提取实际行中的 @命令前缀 */
    const lineCmdMatch = lineText.trim().match(/^@\w+\s*/i);
    if (!lineCmdMatch) return parsedValues;
    let lineBody = lineText.trim().substring(lineCmdMatch[0].length).trim();

    /* --- 第1步：匹配可选字段（fieldCategory === 'optional'） --- */
    fields.forEach((field, index) => {
        if (field.fieldCategory === 'optional' && field.outputTemplate) {
            const parts = field.outputTemplate.split(/\{N\}/);
            let regexStr = '';
            parts.forEach((part, i) => {
                regexStr += part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                if (i < parts.length - 1) regexStr += '(.+?)';
            });
            /* 使用单词边界和大小写不敏感匹配 */
            const regex = new RegExp('\\b' + regexStr, 'i');
            const match = lineBody.match(regex);
            if (match) {
                let val = match[1].trim();
                /* 去掉包裹的引号 */
                val = val.replace(/^"(.*)"$/, '$1');
                parsedValues[index] = val;
                /* 从行体中移除已匹配的部分，避免干扰后续匹配 */
                lineBody = lineBody.replace(regex, '').trim();
            }
        }
    });

    /* --- 第2步：匹配主模板中的占位符字段 --- */
    /* 获取输出模板中占位符的顺序 */
    const phOrder = [];
    const phRegex = /\{(\d+)\}/g;
    let phM;
    while ((phM = phRegex.exec(output)) !== null) {
        phOrder.push(parseInt(phM[1]));
    }

    if (phOrder.length > 0 && lineBody) {
        /* 统计非可选字段列表（按字段数组顺序） */
        const nonOptionalFieldIndices = [];
        fields.forEach((field, idx) => {
            if (field.fieldCategory !== 'optional') {
                nonOptionalFieldIndices.push(idx);
            }
        });

        /* 从 outputBody 构建正则：将 {N} 替换为捕获组 */
        const phParts = outputBody.split(/\{\d+\}/);
        let regexStr = buildFieldRegex(phParts);

        /* 尝试完整匹配（大小写不敏感，尾部允许有额外内容） */
        let baseMatch = tryMatchRegex(lineBody, regexStr);

        /* 如果完整匹配失败，尝试逐步丢弃尾部捕获组 */
        if (!baseMatch) {
            for (let dropCount = 1; dropCount < phParts.length; dropCount++) {
                const truncatedCount = phParts.length - dropCount;
                if (truncatedCount < 2) break; /* 至少需要2个部分才有一个捕获组 */
                const shortParts = phParts.slice(0, truncatedCount);
                baseMatch = tryMatchRegex(lineBody, buildFieldRegex(shortParts));
                if (baseMatch) break;
            }
        }

        if (baseMatch) {
            /* 将捕获组映射到对应的字段索引 */
            phOrder.forEach((phNum, captureIdx) => {
                if (captureIdx >= baseMatch.length - 1) return; /* 捕获组不足 */
                /* phNum 是从1开始的占位符编号，对应第 phNum 个非可选字段 */
                const fieldArrayIdx = nonOptionalFieldIndices[phNum - 1];
                if (fieldArrayIdx !== undefined && baseMatch[captureIdx + 1] !== undefined) {
                    let val = baseMatch[captureIdx + 1].trim();
                    /* 去掉包裹的引号 */
                    val = val.replace(/^"(.*)"$/, '$1');
                    parsedValues[fieldArrayIdx] = val;
                }
            });
        }
    }

    return parsedValues;
}

/* 用指定的 regexStr 尝试匹配 lineBody，大小写不敏感 */
function tryMatchRegex(lineBody, regexStr) {
    if (!lineBody || !regexStr) return null;
    try {
        const regex = new RegExp('^' + regexStr, 'i');
        return lineBody.match(regex);
    } catch (e) {
        return null;
    }
}

/* 从模板分段构建字段提取正则
 * 对相邻占位符（如 {1}{2}），第一个捕获组用贪婪 (.+) 以便正确拆分
 * 最后一个捕获组始终用贪婪 (.+)，避免无后续文字锚定时匹配不完整 */
function buildFieldRegex(phParts) {
    let regexStr = '';
    let prevPartEmpty = false;
    const lastCaptureIdx = phParts.length - 2; /* 最后一个捕获组的索引 */
    phParts.forEach((part, i) => {
        regexStr += part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (i < phParts.length - 1) {
            if (part === '' && !prevPartEmpty) {
                /* 相邻占位符的第一个捕获组：用贪婪匹配 */
                regexStr += '(.+)';
            } else if (i === lastCaptureIdx) {
                /* 最后一个捕获组：用贪婪匹配，避免无后续文字锚定导致匹配不完整 */
                regexStr += '(.+)';
            } else {
                regexStr += '(.+?)';
            }
        }
        prevPartEmpty = (part === '');
    });
    return regexStr;
}

/* 打开导出弹窗 */
function openExportModal() {
    document.getElementById('exportFilename').value = '';
    document.querySelector('input[name="exportFormat"][value="txt"]').checked = true;
    showModal('exportModal');
    document.getElementById('exportFilename').focus();
}

/* 执行导出操作 */
function doExport() {
    const content = getEditorValue();
    if (!content.trim()) {
        showError('编辑器内容为空！');
        return;
    }

    const filename = document.getElementById('exportFilename').value.trim();
    if (!filename) {
        showError('请输入文件名！');
        return;
    }

    const format = document.querySelector('input[name="exportFormat"]:checked').value;
    const fullFilename = filename + '.' + format;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fullFilename;
    a.click();
    URL.revokeObjectURL(url);

    closeModal('exportModal');
    showSuccess('剧本导出成功！');
}

/* 清空编辑器内容 */
function clearEditor() {
    if (confirm('确定要清空编辑器吗？')) {
        setEditorValue('');
        clearSearch();
        showSuccess('编辑器已清空！');
    }
}

/* 跳转到快捷工具配置编辑器 */
function goToConfigEditor() {
    window.location.href = '快捷工具配置编辑器.html';
}

/* 打开音频预览弹窗 */
function showAudioPreviewModal(url) {
    const container = document.getElementById('audioPreviewContainer');
    const urlDisplay = document.getElementById('audioPreviewUrl');
    container.innerHTML = `<audio src="${escapeHtml(url)}" controls style="width: 100%;"></audio>`;
    urlDisplay.textContent = url;
    document.getElementById('audioPreviewModal').classList.add('show');
}

/* 关闭音频预览弹窗 */
function closeAudioPreviewModal() {
    const container = document.getElementById('audioPreviewContainer');
    container.innerHTML = '';
    document.getElementById('audioPreviewModal').classList.remove('show');
}

/* 动态弹窗中的音频链接点击播放 */
document.addEventListener('click', function(e) {
    const audioLink = e.target.closest('.audio-link');
    if (audioLink && audioLink.closest('#dynamicModal')) {
        const url = audioLink.getAttribute('data-url');
        if (url) {
            showAudioPreviewModal(url);
        }
    }
});


