/* --- 全局变量与工具函数 ---
 *   editor, toolsConfig, searchMatches 等全局变量
 *   parseMarkdown, escapeHtml, setCookie/getCookie 等工具函数
 *   formatScript, checkErrors 脚本格式化与错误检查
 *   showSuccess, showError 消息提示
 *   showModal, closeModal, insertSnippet 模态框与片段插入
 *   loadQuickInputItems, saveQuickInputItems 快速输入管理
 *   applyTheme, openPageFormatModal 主题与页面格式
 *   exportCustomOptions, importCustomOptions 自定义选项导入导出
 *   toggleSidebar, 菜单点击交互, 模态框外部关闭
 *   依赖: tools-config.js (findCommandsInConfig 运行时调用) */

let editor;
let currentEditorTab = 'text';
let toolsConfig = null;
let currentModalConfig = null;
let isShiftPressed = false;
let currentEditPos = null;
let allCategoriesCollapsed = false;
let searchMatches = [];
let currentMatchIndex = -1;
let tooltipEnabled = true;
let quickInputItems = [];
let lastErrorLines = null;

/* 将 Markdown 文本渲染为 HTML */
function parseMarkdown(text) {
    let html = text;

    const codeBlocks = [];
    html = html.replace(/```([\s\S]*?)```/g, (match, content) => {
        const index = codeBlocks.length;
        codeBlocks.push(content);
        return `<!-- CODEBLOCK_${index} -->`;
    });

    html = html.replace(/^---\s*$/gim, '<hr>');

    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');

    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    html = html.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');

    html = html.replace(/^\- (.*$)/gim, (match, p1) => {
        return `<li>${p1}</li>`;
    });

    let insideList = false;
    const lines = html.split('\n');
    let result = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('<li>')) {
            if (!insideList) {
                result.push('<ul>');
                insideList = true;
            }
            result.push(line);
        } else {
            if (insideList) {
                result.push('</ul>');
                insideList = false;
            }
            if (line && !line.startsWith('<h') && !line.startsWith('<blockquote') && !line.startsWith('<table') && !line.startsWith('</table') && !line.startsWith('<tr') && !line.startsWith('</tr') && !line.startsWith('|') && !line.startsWith('<details') && !line.startsWith('</details') && !line.startsWith('<summary') && !line.startsWith('</summary') && !line.startsWith('<hr') && !line.startsWith('<!--')) {
                result.push(`<p>${line}</p>`);
            } else {
                result.push(line);
            }
        }
    }
    if (insideList) {
        result.push('</ul>');
    }

    html = result.join('\n');

    /* 扫描 Markdown 表格行（以 | 开头和结尾的行）并转换为 HTML <table> */
    const tableLines = [];
    let inTable = false;
    let tableStart = -1;
    const htmlLines = html.split('\n');

    for (let i = 0; i < htmlLines.length; i++) {
        const line = htmlLines[i].trim();
        if (line.startsWith('|') && line.endsWith('|')) {
            if (!inTable) {
                inTable = true;
                tableStart = i;
            }
            tableLines.push(i);
        } else {
            if (inTable) {
                inTable = false;
            }
        }
    }

    if (tableLines.length > 0) {
        /* 将扫描到的表格行转换为 HTML <table>：第一行作为表头，后续作为数据行，跳过 |---| 分隔行 */
        let newHtml = [];
        let i = 0;
        let currentTable = [];
        let inTableBlock = false;

        while (i < htmlLines.length) {
            if (tableLines.includes(i)) {
                currentTable.push(htmlLines[i].trim());
                inTableBlock = true;
            } else {
                if (inTableBlock) {
                    if (currentTable.length >= 2) {
                        let tableHtml = '<table>';
                        for (let j = 0; j < currentTable.length; j++) {
                            if (j === 1 && currentTable[j].includes('|---')) {
                                continue;
                            }
                            const cells = currentTable[j].split('|').filter(c => c.trim());
                            if (j === 0) {
                                tableHtml += '<tr>';
                                cells.forEach(cell => {
                                    tableHtml += `<th>${cell.trim()}</th>`;
                                });
                                tableHtml += '</tr>';
                            } else {
                                tableHtml += '<tr>';
                                cells.forEach(cell => {
                                    tableHtml += `<td>${cell.trim()}</td>`;
                                });
                                tableHtml += '</tr>';
                            }
                        }
                        tableHtml += '</table>';
                        newHtml.push(tableHtml);
                    }
                    currentTable = [];
                    inTableBlock = false;
                }
                newHtml.push(htmlLines[i]);
            }
            i++;
        }

        if (currentTable.length > 0) {
            if (currentTable.length >= 2) {
                let tableHtml = '<table>';
                for (let j = 0; j < currentTable.length; j++) {
                    if (j === 1 && currentTable[j].includes('|---')) {
                        continue;
                    }
                    const cells = currentTable[j].split('|').filter(c => c.trim());
                    if (j === 0) {
                        tableHtml += '<tr>';
                        cells.forEach(cell => {
                            tableHtml += `<th>${cell.trim()}</th>`;
                        });
                        tableHtml += '</tr>';
                    } else {
                        tableHtml += '<tr>';
                        cells.forEach(cell => {
                            tableHtml += `<td>${cell.trim()}</td>`;
                        });
                        tableHtml += '</tr>';
                    }
                }
                tableHtml += '</table>';
                newHtml.push(tableHtml);
            }
        }

        html = newHtml.join('\n');
    }

    html = html.replace(/^\-{3,}$/gm, '<hr>');

    html = html.replace(/<!-- CODEBLOCK_(\d+) -->/g, (match, index) => {
        const content = escapeHtml(codeBlocks[parseInt(index)]);
        return `<pre><code>${content}</code></pre>`;
    });

    return `<div class="markdown-content">${html}</div>`;
}

/* HTML 转义（防止 XSS） */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/* 获取编辑器当前内容 */
function getEditorValue() {
    return editor && editor.getValue ? editor.getValue() : '';
}

/* 设置编辑器内容 */
function setEditorValue(value) {
    if (editor && editor.setValue) {
        editor.setValue(value || '');
    }
}

/* 聚焦到编辑器 */
function focusEditor() {
    if (editor && editor.focus) {
        editor.focus();
    }
}

/* 设置编辑器选中范围（按字符索引） */
function setEditorSelectionRange(start, end) {
    if (editor && editor.setSelection && editor.posFromIndex) {
        const from = editor.posFromIndex(start);
        const to = editor.posFromIndex(end);
        editor.setSelection(from, to);
    }
}

/* 滚动编辑器到指定垂直位置 */
function scrollEditorTo(top) {
    if (editor && editor.getScrollerElement) {
        editor.getScrollerElement().scrollTop = top;
    }
}

/* 设置 Cookie */
function setCookie(name, value, days) {
    const expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = name + '=' + encodeURIComponent(value) + ';expires=' + expires.toUTCString() + ';path=/';
}

/* 读取 Cookie */
function getCookie(name) {
    const nameEQ = name + '=';
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return decodeURIComponent(c.substring(nameEQ.length, c.length));
    }
    return null;
}

/* 格式化脚本：统一引号/冒号、压缩空行 */
function formatScript() {
    let content = getEditorValue();

    content = content.replace(/“/g, '"');
    content = content.replace(/”/g, '"');

    content = content.replace(/(.+?)：\s*(.+)/g, (match, name, text) => {
        return `${name}: ${text.trim()}`;
    });

    content = content.replace(/\n{3,}/g, '\n\n');

    setEditorValue(content);
    showSuccess('剧本格式化成功！');
}

/* 检查脚本错误与警告（模态窗显示） */
function checkErrors() {
    const content = getEditorValue();
    const items = [];

    const lines = content.split('\n');
    lines.forEach((line, index) => {
        const lineNum = index + 1;
        const trimmedLine = line.trim();
        const leadingSpaces = line.length - line.trimStart().length;

        if (!trimmedLine) return;
        if (trimmedLine.startsWith(';')) return;

        // 定位真实列号（基于原始行）
        function colAt(offsetInTrimmed) {
            return leadingSpaces + offsetInTrimmed + 1;
        }

        if (trimmedLine.startsWith('@')) {
            const cmdMatch = trimmedLine.match(/^@(\w*)/);
            const cmd = cmdMatch ? cmdMatch[1] : '';
            if (!cmd) {
                items.push({ type: 'error', line: lineNum, col: colAt(0), msg: '命令格式错误，缺少命令名称' });
                return;
            }

            const configs = findCommandsInConfig(cmd);
            if (configs.length === 0) {
                items.push({ type: 'warning', line: lineNum, col: colAt(0), msg: `命令 "@${cmd}" 未在配置中定义` });
                return;
            }

            const lineAfterCmd = trimmedLine.substring(cmd.length + 2).trim();
            if (!lineAfterCmd) return;

            const cnColonPos = lineAfterCmd.search(/：/);
            if (cnColonPos !== -1) {
                items.push({ type: 'warning', line: lineNum, col: colAt(cmd.length + 2 + cnColonPos), msg: `使用了中文冒号 "：" 应改为英文冒号 ":"` });
            }

            const cnAnyQuote = lineAfterCmd.match(/[\u201C\u201D\uFF02]/);
            if (cnAnyQuote) {
                items.push({ type: 'warning', line: lineNum, col: colAt(cmd.length + 2 + cnAnyQuote.index), msg: '含有中文弯引号，应全部使用英文直引号' });
            }

            const keyRegex = /([A-Za-z_][A-Za-z0-9_-]*)\s*:/g;
            const lineKeys = [];
            let m;
            while ((m = keyRegex.exec(lineAfterCmd)) !== null) {
                lineKeys.push({ key: m[1].toLowerCase(), pos: colAt(cmd.length + 2 + m.index) });
            }
            if (lineKeys.length === 0) return;

            const knownKeys = new Set();
            configs.forEach(c => {
                const afterCmd = c.output.replace(/^@\w+\s*/, '');
                let m2;
                while ((m2 = keyRegex.exec(afterCmd)) !== null) {
                    knownKeys.add(m2[1].toLowerCase());
                }
            });
            // 补充收集可选字段的 outputTemplate 中的参数名
            if (toolsConfig) {
                for (const cat of toolsConfig.categories) {
                    for (const item of cat.items) {
                        if (item.type === 'modal' && item.modal && item.modal.fields) {
                            const outCmd = item.modal.output.match(/^@(\w+)/i);
                            if (outCmd && outCmd[1].toLowerCase() === cmd.toLowerCase()) {
                                for (const field of item.modal.fields) {
                                    if (field.fieldCategory === 'optional' && field.outputTemplate) {
                                        const after = field.outputTemplate.replace(/^@\w+\s*/, '');
                                        const optRegex = /([A-Za-z_][A-Za-z0-9_-]*)\s*:/g;
                                        let m3;
                                        while ((m3 = optRegex.exec(after)) !== null) {
                                            knownKeys.add(m3[1].toLowerCase());
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            if (knownKeys.size === 0) return;

            for (const { key, pos } of lineKeys) {
                if (!knownKeys.has(key)) {
                    items.push({ type: 'warning', line: lineNum, col: pos, msg: `命令 "@${cmd}" 的未知参数 "${key}"` });
                }
            }
        }
        else if (trimmedLine.includes(':')) {
            const firstColon = trimmedLine.indexOf(':');
            const secondColon = trimmedLine.indexOf(':', firstColon + 1);
            if (secondColon !== -1) {
                items.push({ type: 'error', line: lineNum, col: colAt(secondColon), msg: '对话格式错误，包含多个冒号' });
            }
        }

        const pipePos = trimmedLine.indexOf('|');
        if (pipePos !== -1 && !trimmedLine.includes('@')) {
            items.push({ type: 'warning', line: lineNum, col: colAt(pipePos), msg: '包含分隔符 "|"，可能是格式错误' });
        }

        const ampPos = trimmedLine.indexOf('&');
        if (ampPos !== -1 && !trimmedLine.includes('@')) {
            items.push({ type: 'warning', line: lineNum, col: colAt(ampPos), msg: '包含占位符标记 "&"，可能是模板未替换完成' });
        }
    });

    const errors = items.filter(i => i.type === 'error');
    const warnings = items.filter(i => i.type === 'warning');

    lastErrorLines = {
        errors: errors.map(e => e.line),
        warnings: warnings.map(w => w.line)
    };

    const modalTitle = document.getElementById('dynamicModalTitle');
    const modalBody = document.getElementById('dynamicModalBody');
    const modalFooter = document.getElementById('dynamicModalFooter');

    if (errors.length === 0 && warnings.length === 0) {
        modalTitle.textContent = '错误检查';
        modalBody.innerHTML = `
            <div style="text-align:center;padding:40px 20px;">
                <div style="font-size:48px;margin-bottom:16px;">✅</div>
                <div style="font-size:18px;font-weight:600;color:#2e7d32;margin-bottom:8px;">未发现错误</div>
                <div style="color:#888;font-size:14px;">脚本格式正确，可以放心使用。</div>
            </div>
        `;
        modalFooter.innerHTML = `<button class="modal-btn modal-btn-secondary" onclick="closeErrorModal()">关闭</button>`;
        showModal('dynamicModal');
        return;
    }

    let html = '<div style="display:flex;gap:12px;margin-bottom:16px;">';
    if (errors.length > 0) {
        html += `<div style="flex:1;text-align:center;padding:10px;background:#ffebee;border-radius:8px;">
            <div style="font-size:24px;font-weight:700;color:#c62828;">${errors.length}</div>
            <div style="font-size:12px;color:#c62828;font-weight:500;">错误</div>
        </div>`;
    }
    if (warnings.length > 0) {
        html += `<div style="flex:1;text-align:center;padding:10px;background:#fff3e0;border-radius:8px;">
            <div style="font-size:24px;font-weight:700;color:#e65100;">${warnings.length}</div>
            <div style="font-size:12px;color:#e65100;font-weight:500;">警告</div>
        </div>`;
    }
    html += '</div>';

    const grouped = [...errors, ...warnings];
    html += '<div style="max-height:400px;overflow-y:auto;">';
    grouped.forEach(e => {
        const bg = e.type === 'error' ? '#ffebee' : '#fff3e0';
        const badgeBg = e.type === 'error' ? '#c62828' : '#e65100';
        const icon = e.type === 'error' ? '❌' : '⚠️';
        html += `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:${bg};border-radius:8px;margin-bottom:6px;font-size:13px;">`;
        html += `<span style="flex-shrink:0;margin-top:1px;">${icon}</span>`;
        html += `<span style="flex-shrink:0;background:#f5f5f5;padding:2px 10px;border-radius:4px;font-family:monospace;font-size:12px;font-weight:600;color:#555;letter-spacing:0.5px;">L${e.line}:C${e.col}</span>`;
        html += `<span style="color:#333;flex:1;line-height:1.6;">${e.msg}</span>`;
        html += `<span style="flex-shrink:0;font-size:11px;background:${badgeBg};color:white;padding:1px 8px;border-radius:10px;font-weight:600;">${e.type === 'error' ? '错误' : '警告'}</span>`;
        html += '</div>';
    });
    html += '</div>';

    modalTitle.textContent = '错误检查结果';
    modalBody.innerHTML = html;
    modalFooter.innerHTML = `
        <button class="modal-btn modal-btn-primary" onclick="closeErrorModal()">关闭</button>
    `;
    showModal('dynamicModal');
}

/* 关闭错误检查弹窗并高亮问题行 */
function closeErrorModal() {
    closeModal('dynamicModal');
    if (lastErrorLines) {
        clearLineHighlights();
        if (lastErrorLines.errors.length > 0) {
            lastErrorLines.errors.forEach(line => highlightLine(line, 'error'));
        }
        if (lastErrorLines.warnings.length > 0) {
            lastErrorLines.warnings.forEach(line => highlightLine(line, 'warning'));
        }
    }
}

/* 打开模态框 */
function showModal(modalId) {
    document.getElementById(modalId).classList.add('show');
}

/* 关闭模态框 */
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('show');
    if (modalId === 'dynamicModal') {
        currentEditPos = null;
    }
}

/* 在编辑器光标位置插入脚本片段 */
function insertSnippet(snippet, inlineInsert) {
    if (!editor || !editor.replaceSelection) return;
    const cursor = editor.getCursor();
    if (inlineInsert) {
        editor.replaceSelection(snippet);
        editor.setCursor({ line: cursor.line, ch: cursor.ch + snippet.length });
    } else {
        editor.replaceSelection(snippet + '\n');
        const lineCount = snippet.split('\n').length;
        editor.setCursor({ line: cursor.line + lineCount, ch: 0 });
    }
    focusEditor();
    localStorage.setItem('editorAutoSave', editor.getValue());
}

/* 显示成功提示 */
function showSuccess(message) {
    const successMessage = document.getElementById('successMessage');
    if (!successMessage) return;
    successMessage.textContent = message;
    successMessage.style.display = 'block';
    successMessage.classList.add('show');

    setTimeout(() => {
        successMessage.style.display = 'none';
        successMessage.classList.remove('show');
    }, 3000);
}

/* 显示错误提示 */
function showError(message) {
    const errorMessage = document.getElementById('errorMessage');
    if (!errorMessage) return;
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    errorMessage.classList.add('show');

    setTimeout(() => {
        errorMessage.style.display = 'none';
        errorMessage.classList.remove('show');
    }, 3000);
}

/* 加载 Markdown 文件并渲染到模态框 */
async function renderMarkdownModal(filename, modalId, title) {
    try {
        const response = await fetch(filename);
        if (response.ok) {
            const content = await response.text();
            let html = parseMarkdown(content);

            const sections = html.split('<hr>');
            if (sections.length > 1) {
                let result = sections[0];
                for (let i = 1; i < sections.length; i++) {
                    const section = sections[i].trim();
                    if (section) {
                        const h2Match = section.match(/^<h2>(.*?)<\/h2>/);
                        if (h2Match) {
                            const summary = h2Match[1];
                            const body = section.substring(h2Match[0].length);
                            result += '<details class="version-old">\n<summary><h2>' + summary + '</h2></summary>\n' + body + '\n</details>\n';
                        } else {
                            result += section;
                        }
                    }
                }
                html = result;
            }

            const modalBody = document.querySelector(`#${modalId} .modal-body`);
            if (modalBody) {
                modalBody.innerHTML = html;
            }
            if (title) {
                const titleEl = document.querySelector(`#${modalId} .modal-header h3`);
                if (titleEl) {
                    titleEl.textContent = title;
                }
            }
        } else {
            const modalBody = document.querySelector(`#${modalId} .modal-body`);
            if (modalBody) {
                modalBody.innerHTML = `<p>文件加载失败: ${filename}</p>`;
            }
        }
    } catch (error) {
        const modalBody = document.querySelector(`#${modalId} .modal-body`);
        if (modalBody) {
            modalBody.innerHTML = `<p>文件加载失败: ${filename}</p>`;
        }
    }
    showModal(modalId);
}

/* 打开帮助弹窗 */
async function showHelp() {
    await renderMarkdownModal('使用帮助.md', 'helpModal', '使用帮助');
}

/* 打开更新日志弹窗 */
async function showChangelog() {
    await renderMarkdownModal('更新日志.md', 'changelogModal', '更新日志');
}

/* 导出自定义选项（从 Cookie 导出为 JSON） */
function exportCustomOptions() {
    const cookies = document.cookie.split(';');
    const customOptions = {};

    cookies.forEach(cookie => {
        const [name, value] = cookie.split('=').map(c => c.trim());
        if (name.startsWith('custom_options_')) {
            try {
                customOptions[name] = JSON.parse(decodeURIComponent(value));
            } catch {
                customOptions[name] = decodeURIComponent(value);
            }
        }
    });

    if (Object.keys(customOptions).length === 0) {
        showError('没有可导出的自定义选项数据');
        return;
    }

    const blob = new Blob([JSON.stringify(customOptions, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '快捷工具自定义选项.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showSuccess('自定义选项已导出！');
}

/* 从 JSON 文件导入自定义选项 */
function importCustomOptions() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const data = JSON.parse(event.target.result);
                let importCount = 0;

                for (const [name, value] of Object.entries(data)) {
                    if (name.startsWith('custom_options_')) {
                        const cookieValue = Array.isArray(value) ? JSON.stringify(value) : value;
                        setCookie(name, cookieValue, 365);
                        importCount++;
                    }
                }

                if (importCount > 0) {
                    showSuccess(`成功导入 ${importCount} 个自定义选项！`);
                    setTimeout(() => location.reload(), 1500);
                } else {
                    showError('文件中没有找到有效的自定义选项数据');
                }
            } catch (error) {
                showError('文件格式错误：' + error.message);
            }
        };
        reader.readAsText(file, 'UTF-8');
    };

    input.click();
}

const DEFAULT_QUICK_INPUT_CSV = 'dev剧本编辑器/dev_初始配置/default-quick-input.csv';

/* 同步 XHR 加载默认 CSV 配置（仅作为 localStorage 为空时的后备） */
function loadDefaultQuickInputFromCSV() {
    try {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', DEFAULT_QUICK_INPUT_CSV, false);
        xhr.overrideMimeType('text/csv;charset=utf-8');
        xhr.send();
        if (xhr.status !== 200 && xhr.status !== 0) return null;

        const text = xhr.responseText.replace(/^\uFEFF/, '');
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length < 2) return null;

        const prefixMap = {};
        const grouped = {};
        const plainItems = [];

        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(',');
            const cat = (parts[0] || '').trim();

            if (cat === '系统设置' && parts[1] === '列表名') {
                const groupName = (parts[2] || '').trim();
                const groupPrefix = (parts[3] || '').trim().toUpperCase();
                if (groupName && groupPrefix) prefixMap[groupName] = groupPrefix;
                continue;
            }

            const name = (parts[1] || '').trim();
            if (!cat || !name) continue;

            if (cat === '普通列表' || cat === '普通' || cat === '常用') {
                plainItems.push(name);
            } else if (prefixMap[cat]) {
                grouped[cat] = grouped[cat] || [];
                grouped[cat].push(name);
            } else {
                plainItems.push(name);
            }
        }

        const groups = Object.entries(grouped).map(([cn, items]) => ({
            id: generateCategoryId(),
            name: cn,
            prefix: prefixMap[cn] || cn.charAt(0).toUpperCase(),
            items: items
        }));

        return { quickInputItems: plainItems, quickCategoryGroups: groups };
    } catch (e) {
        return null;
    }
}

/* 从 localStorage 加载快速输入列表 */
function loadQuickInputItems() {
    try {
        const saved = localStorage.getItem('quickInputItems');
        if (saved) {
            quickInputItems = JSON.parse(saved);
        } else {
            const defaults = loadDefaultQuickInputFromCSV();
            if (defaults && defaults.quickInputItems) {
                quickInputItems = defaults.quickInputItems;
                saveQuickInputItems();
            } else {
                quickInputItems = [];
            }
        }
    } catch (e) {
        quickInputItems = [];
    }
}

/* 将快速输入列表保存到 localStorage */
function saveQuickInputItems() {
    try {
        localStorage.setItem('quickInputItems', JSON.stringify(quickInputItems));
    } catch (e) {}
}

/* 清空普通快速输入列表 */
function clearQuickInputList() {
    if (!confirm('确定要清空普通列表和分类快速输入的所有数据吗？')) return;
    quickInputItems = [];
    saveQuickInputItems();
    if (typeof quickCategoryGroups !== 'undefined') {
        quickCategoryGroups.length = 0;
        saveQuickCategoryGroups();
    }
    const textarea = document.getElementById('quickInputTextarea');
    if (textarea) textarea.value = '';
    const content = document.getElementById('qiCategoryContent') || document.getElementById('dynamicModalBody');
    if (typeof renderCategoryModal === 'function' && content) renderCategoryModal(content);
    showSuccess('已清空');
}

/* 自定义警告弹窗（模糊背景 + 渐入动画 + 音效） */
function showWarningModal(options) {
    try {
        const audio = new Audio('dev系统资源/error.mp3');
        audio.volume = 0.6;
        audio.play().catch(function(){});
    } catch(e) {}

    const overlay = document.createElement('div');
    overlay.className = 'warning-overlay';
    overlay.innerHTML = `
        <div class="warning-modal">
            <div class="warning-header">
                <span class="warning-icon">${options.icon || '⚠️'}</span>
                <h3 class="warning-title">${options.title || '警告'}</h3>
            </div>
            <div class="warning-body">
                ${options.desc ? '<p class="warning-desc">' + options.desc + '</p>' : ''}
                ${options.list && options.list.length ? '<ul class="warning-list">' + options.list.map(i => '<li>' + i + '</li>').join('') + '</ul>' : ''}
                ${options.hint ? '<p class="warning-hint">' + options.hint + '</p>' : ''}
            </div>
            <div class="warning-footer">
                <button class="wbtn wbtn-cancel">${options.cancelText || '取消'}</button>
                <button class="wbtn wbtn-confirm">${options.confirmText || '确定继续'}</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    requestAnimationFrame(() => overlay.classList.add('show'));

    overlay.querySelector('.wbtn-cancel').addEventListener('click', function() {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 300);
        if (options.onCancel) options.onCancel();
    });

    overlay.querySelector('.wbtn-confirm').addEventListener('click', function() {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 300);
        if (options.onConfirm) options.onConfirm();
    });

    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
            overlay.classList.remove('show');
            setTimeout(() => overlay.remove(), 300);
            if (options.onCancel) options.onCancel();
        }
    });
}

/* 一键加载默认数据（快速输入列表 + 默认剧本 + 重置用户设置） */
function loadDefaultData() {
    showWarningModal({
        icon: '🚨',
        title: '加载默认数据',
        desc: '此操作将重置所有内容为出厂默认状态，且无法撤销！',
        list: [
            '编辑器中的当前剧本',
            '普通快速输入列表',
            '分类快速输入数据',
            '页面样式设置（主题/字体/颜色）',
            '代码提示开关状态',
            '阅读模式显示级别',
            '工具提示快捷键'
        ],
        hint: '建议先导出 CSV 备份数据，再继续操作。',
        confirmText: '确认加载',
        cancelText: '取消',
        onConfirm: function() {
            /* 重置用户设置 */

            savePageFormatToCookie(defaultPageFormat);
            applyPageFormat(defaultPageFormat);

            tooltipEnabled = true;
            const hintOn = document.getElementById('menuHintOn');
            const hintOff = document.getElementById('menuHintOff');
            if (hintOn && hintOff) {
                hintOn.style.fontWeight = 'bold';
                hintOff.style.fontWeight = 'normal';
            }

            setCookie('readingScriptInfo', 'false', 365);
            const readingOn = document.getElementById('menuReadingOn');
            const readingOff = document.getElementById('menuReadingOff');
            if (readingOn && readingOff) {
                readingOn.style.fontWeight = 'bold';
                readingOff.style.fontWeight = 'normal';
            }

            setCookie('tooltipShortcut', 'F2', 365);

            /* 加载默认快速输入 */
            const DEFAULT_SCRIPT_PATH = 'dev剧本编辑器/dev_初始配置/默认剧本.txt';

            try {
                const defaults = loadDefaultQuickInputFromCSV();
                if (!defaults) {
                    showError('加载默认配置失败，请检查 dev_初始配置 文件是否存在');
                    return;
                }

                if (defaults.quickInputItems) {
                    quickInputItems = defaults.quickInputItems;
                    saveQuickInputItems();
                }

                if (defaults.quickCategoryGroups && typeof quickCategoryGroups !== 'undefined') {
                    quickCategoryGroups.length = 0;
                    defaults.quickCategoryGroups.forEach(g => {
                        if (!g.id) g.id = generateCategoryId();
                        quickCategoryGroups.push(g);
                    });
                    saveQuickCategoryGroups();
                }

                const xhr = new XMLHttpRequest();
                xhr.open('GET', DEFAULT_SCRIPT_PATH, false);
                xhr.overrideMimeType('text/plain;charset=utf-8');
                xhr.send();
                if (xhr.status === 200 || xhr.status === 0) {
                    setEditorValue(xhr.responseText);
                    localStorage.setItem('editorAutoSave', xhr.responseText);
                    clearSearch();
                } else {
                    showError('默认剧本加载失败');
                    return;
                }

                const textarea = document.getElementById('quickInputTextarea');
                if (textarea) textarea.value = quickInputItems.join('\n');

                const content = document.getElementById('qiCategoryContent') || document.getElementById('dynamicModalBody');
                if (typeof renderCategoryModal === 'function' && content) renderCategoryModal(content);

                showSuccess('默认数据加载成功！');
            } catch (e) {
                showError('加载默认数据失败：' + e.message);
            }
        }
    });
}

/* CSV 导出（分组定义 + 数据一体） */
function exportQuickInputToCSV() {
    let csv = '\uFEFF类别,名称,备注说明\n';
    const groups = typeof quickCategoryGroups !== 'undefined' ? quickCategoryGroups : [];
    for (const g of groups) {
        csv += '系统设置,列表名,' + g.name + ',' + g.prefix + '\n';
    }
    const items = typeof quickInputItems !== 'undefined' ? quickInputItems : [];
    for (const item of items) {
        csv += '普通列表,' + item + ',\n';
    }
    for (const g of groups) {
        for (const item of g.items) {
            csv += g.name + ',' + item + ',\n';
        }
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'quick-input-config.csv';
    a.click();
    URL.revokeObjectURL(url);
}

/* CSV 导入（从 csv 读取分组定义和数据） */
function importQuickInputFromCSV() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const text = e.target.result.replace(/^\uFEFF/, '');
                const lines = text.split('\n').map(l => l.trim()).filter(l => l);
                if (lines.length < 2) { showError('CSV 文件为空'); return; }

                const prefixMap = {};
                const grouped = {};
                let plainItems = [];

                for (let i = 1; i < lines.length; i++) {
                    const parts = lines[i].split(',');
                    const cat = (parts[0] || '').trim();

                    if (cat === '系统设置' && parts[1] === '列表名') {
                        const groupName = (parts[2] || '').trim();
                        const groupPrefix = (parts[3] || '').trim().toUpperCase();
                        if (groupName && groupPrefix) {
                            prefixMap[groupName] = groupPrefix;
                        }
                        continue;
                    }

                    const name = (parts[1] || '').trim();
                    if (!cat || !name) continue;

                    if (cat === '普通列表' || cat === '普通' || cat === '常用') {
                        plainItems.push(name);
                    } else if (prefixMap[cat]) {
                        grouped[cat] = grouped[cat] || [];
                        grouped[cat].push(name);
                    } else {
                        plainItems.push(name);
                    }
                }

                if (typeof quickCategoryGroups !== 'undefined') {
                    quickCategoryGroups.length = 0;
                    for (const [cn, items] of Object.entries(grouped)) {
                        quickCategoryGroups.push({
                            id: generateCategoryId(),
                            name: cn,
                            prefix: prefixMap[cn] || cn.charAt(0).toUpperCase(),
                            items: items
                        });
                    }
                    saveQuickCategoryGroups();
                    const content = document.getElementById('qiCategoryContent') || document.getElementById('dynamicModalBody');
                    if (content) renderCategoryModal(content);
                }

                if (typeof quickInputItems !== 'undefined') {
                    quickInputItems = plainItems;
                    saveQuickInputItems();
                    const textarea = document.getElementById('quickInputTextarea');
                    if (textarea) textarea.value = plainItems.join('\n');
                }

                const total = Object.values(grouped).reduce((s, a) => s + a.length, 0) + plainItems.length;
                showSuccess('CSV 导入成功！共 ' + total + ' 项');
            } catch (err) {
                showError('CSV 解析失败：' + err.message);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

/* 开关代码提示悬浮窗 */
function setCodeHints(enabled) {
    tooltipEnabled = enabled;
    const onItem = document.getElementById('menuHintOn');
    const offItem = document.getElementById('menuHintOff');
    if (onItem && offItem) {
        onItem.style.fontWeight = enabled ? 'bold' : 'normal';
        offItem.style.fontWeight = enabled ? 'normal' : 'bold';
    }
    if (!enabled) {
        const tooltip = document.getElementById('commandTooltip');
        if (tooltip) {
            tooltip.style.display = 'none';
        }
    }
}

/* 设置阅读模式信息显示级别 */
function setReadingScriptInfo(enabled) {
    setCookie('readingScriptInfo', enabled ? 'true' : 'false', 365);
    const onItem = document.getElementById('menuReadingOn');
    const offItem = document.getElementById('menuReadingOff');
    if (onItem && offItem) {
        onItem.style.fontWeight = enabled ? 'normal' : 'bold';
        offItem.style.fontWeight = enabled ? 'bold' : 'normal';
    }
    if (typeof renderReadingMode === 'function') {
        renderReadingMode();
    }
}

/* 获取工具提示快捷键 */
function getTooltipShortcut() {
    const saved = getCookie('tooltipShortcut');
    return saved || 'F2';
}

/* 设置工具提示快捷键 */
function setTooltipShortcut(key) {
    setCookie('tooltipShortcut', key, 365);
}

/* 打开工具提示快捷键设置弹窗 */
function openTooltipShortcutModal() {
    const currentShortcut = getTooltipShortcut();
    const modalTitle = document.getElementById('dynamicModalTitle');
    const modalBody = document.getElementById('dynamicModalBody');
    const modalFooter = document.getElementById('dynamicModalFooter');

    modalTitle.textContent = '设置工具提示快捷键';

    let bodyHtml = '<div class="form-group">';
    bodyHtml += '<label>选择快捷键：</label>';
    bodyHtml += '<select id="shortcutSelect">';
    const keys = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'];
    keys.forEach(k => {
        bodyHtml += `<option value="${k}" ${k === currentShortcut ? 'selected' : ''}>${k}</option>`;
    });
    bodyHtml += '</select>';
    bodyHtml += '<p style="font-size:12px;color:#888;margin-top:8px;">按选中的快捷键可固定/解锁命令悬浮提示窗，方便编辑参数。</p>';
    bodyHtml += '</div>';
    modalBody.innerHTML = bodyHtml;

    modalFooter.innerHTML = `
        <button class="modal-btn modal-btn-primary" onclick="saveTooltipShortcut()">保存</button>
        <button class="modal-btn modal-btn-secondary" onclick="closeModal('dynamicModal')">取消</button>
    `;

    showModal('dynamicModal');
}

/* 保存工具提示快捷键设置 */
function saveTooltipShortcut() {
    const key = document.getElementById('shortcutSelect').value;
    setTooltipShortcut(key);
    closeModal('dynamicModal');
    showSuccess('快捷键已设置为 ' + key + '，刷新页面后生效');
}

/* 打开快速输入列表编辑弹窗 */
function openQuickInputModal() {
    const modalTitle = document.getElementById('dynamicModalTitle');
    const modalBody = document.getElementById('dynamicModalBody');
    const modalFooter = document.getElementById('dynamicModalFooter');

    modalTitle.textContent = '快速输入列表';
    modalBody.innerHTML = `
        <div class="modal-description" style="margin-bottom:12px;color:#666;font-size:13px;">
            每行输入一个词条，保存后在编辑器中输入其第一个字符时会触发自动补全。
        </div>
        <textarea id="quickInputTextarea" style="width:100%;height:250px;padding:10px;border:1px solid #ddd;border-radius:4px;font-size:14px;resize:vertical;box-sizing:border-box;" placeholder="例如：&#10;张三&#10;李四&#10;王五&#10;魔法学院">${escapeHtml(quickInputItems.join('\n'))}</textarea>
    `;
    modalFooter.innerHTML = `
        <button class="modal-btn" onclick="importQuickInputFromCSV()">📥 CSV</button>
        <button class="modal-btn" onclick="exportQuickInputToCSV()">📤 CSV</button>
        <button class="modal-btn modal-btn-danger" onclick="clearQuickInputList()">🗑️ 清空</button>
        <button class="modal-btn" onclick="closeModal('dynamicModal')">取消</button>
        <button class="modal-btn modal-btn-primary" onclick="saveQuickInputList()">保存</button>
    `;
    showModal('dynamicModal');
}

/* 保存快速输入列表 */
function saveQuickInputList() {
    const textarea = document.getElementById('quickInputTextarea');
    if (!textarea) return;
    const lines = textarea.value.split('\n').map(l => l.trim()).filter(l => l);
    quickInputItems = lines;
    saveQuickInputItems();
    closeModal('dynamicModal');
}

const defaultPageFormat = {
    theme: "default",
    fontFamily: "'Microsoft YaHei', Arial, sans-serif",
    fontSize: "14px",
    fontColor: "#333333"
};

const themes = {
    "default": {
        css: "editortheme/default.css",
        class: "theme-default"
    },
    "eye-protection": {
        css: "editortheme/eye-protection.css",
        class: "theme-eye-protection"
    },
    "dark-blue": {
        css: "editortheme/dark-blue.css",
        class: "theme-dark-blue"
    },
    "light-blue": {
        css: "editortheme/light-blue.css",
        class: "theme-light-blue"
    }
};

/* 应用编辑器主题 */
function applyTheme(themeName) {
    const theme = themes[themeName];
    if (!theme) return;

    const themeCss = document.getElementById('theme-css');
    if (themeCss) {
        themeCss.href = theme.css + '?v=' + Date.now();
    }

    Object.values(themes).forEach(t => {
        document.body.classList.remove(t.class);
    });

    document.body.classList.add(theme.class);

    /* 同步更新 favicon 颜色 */
    updateFaviconForTheme(themeName);

    const readingTab = document.getElementById('reading-tab');
    if (readingTab && readingTab.style.display !== 'none') {
        if (typeof renderReadingMode === 'function') {
            renderReadingMode();
        }
    }
}

/* 缓存 SVG 文本，避免重复 fetch */
let _cachedSvgText = null;

/* 根据当前主题切换 favicon 颜色（浅色主题用黑色，深色主题用白色） */
function updateFaviconForTheme(themeName) {
    const isDark = themeName === 'dark-blue';
    const link = document.querySelector('link[rel="icon"]');
    if (!link) return;

    if (isDark) {
        /* 深色主题：用白色 favicon */
        if (_cachedSvgText) {
            applyFaviconColor(_cachedSvgText, '#ffffff', link);
        } else {
            fetch('dev系统资源/LOGO.svg?' + Date.now()).then(function(r) {
                return r.text();
            }).then(function(svg) {
                _cachedSvgText = svg;
                applyFaviconColor(svg, '#ffffff', link);
            }).catch(function() {});
        }
    } else {
        /* 浅色主题：恢复原始 SVG，由 prefers-color-scheme 自动处理 OS 深色模式 */
        link.href = 'dev系统资源/LOGO.svg';
    }
}

/* 将 SVG 中的填充色替换为指定颜色，通过 data URI 设置为 favicon */
function applyFaviconColor(svg, color, link) {
    var modified = svg.replace('.icon-fill { fill: #000000; }', '.icon-fill { fill: ' + color + '; }');
    var blob = new Blob([modified], { type: 'image/svg+xml' });
    var url = URL.createObjectURL(blob);
    link.href = url;
    /* 释放上一个 blob URL */
    if (link.dataset.blobUrl) {
        URL.revokeObjectURL(link.dataset.blobUrl);
    }
    link.dataset.blobUrl = url;
}

/* 将页面格式保存到 Cookie */
function savePageFormatToCookie(format) {
    setCookie('pageFormat', JSON.stringify(format), 365);
}

/* 从 Cookie 读取页面格式 */
function getPageFormatFromCookie() {
    const cookieValue = getCookie('pageFormat');
    if (!cookieValue) return null;
    try {
        return JSON.parse(cookieValue);
    } catch {
        return null;
    }
}

/* 打开页面样式设置弹窗 */
function openPageFormatModal() {
    const savedFormat = getPageFormatFromCookie();
    const format = savedFormat || defaultPageFormat;

    const themeRadio = document.querySelector(`input[name="theme"][value="${format.theme}"]`);
    if (themeRadio) themeRadio.checked = true;

    document.getElementById('fontFamilySelect').value = format.fontFamily;
    document.getElementById('fontSizeSelect').value = format.fontSize;
    document.getElementById('fontColorPicker').value = format.fontColor;

    showModal('pageFormatModal');
}

/* 保存页面样式设置 */
function savePageFormat() {
    const themeValue = document.querySelector('input[name="theme"]:checked')?.value || 'default';
    const format = {
        theme: themeValue,
        fontFamily: document.getElementById('fontFamilySelect').value,
        fontSize: document.getElementById('fontSizeSelect').value,
        fontColor: document.getElementById('fontColorPicker').value
    };

    savePageFormatToCookie(format);
    applyPageFormat(format);
    closeModal('pageFormatModal');
    showSuccess('页面样式已保存！');
}

/* 重置页面样式为默认 */
function resetPageFormat() {
    savePageFormatToCookie(defaultPageFormat);
    applyPageFormat(defaultPageFormat);

    const themeRadio = document.querySelector(`input[name="theme"][value="${defaultPageFormat.theme}"]`);
    if (themeRadio) themeRadio.checked = true;

    document.getElementById('fontFamilySelect').value = defaultPageFormat.fontFamily;
    document.getElementById('fontSizeSelect').value = defaultPageFormat.fontSize;
    document.getElementById('fontColorPicker').value = defaultPageFormat.fontColor;

    showSuccess('已重置为默认设置！');
}

/* 对编辑器应用页面格式设置 */
function applyPageFormat(format) {
    document.body.style.fontFamily = format.fontFamily;
    const wrapper = editor && editor.getWrapperElement ? editor.getWrapperElement() : null;
    if (wrapper) {
        wrapper.style.fontFamily = format.fontFamily;
        wrapper.style.fontSize = format.fontSize;
        wrapper.style.color = format.fontColor;
    }

    const lineNumbers = document.getElementById('lineNumbers');
    if (lineNumbers) {
        lineNumbers.style.fontFamily = format.fontFamily;
        lineNumbers.style.fontSize = format.fontSize;
    }

    applyTheme(format.theme);
}

/* 切换侧边栏显示/隐藏（移动端） */
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    sidebar.classList.toggle('mobile-hidden');
}

/* 全局点击：只管理菜单展开状态，不再点空白处关闭模态框 */
document.addEventListener('click', function(event) {
    const menuItem = event.target.closest('.menu-item');
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        if (item !== menuItem) {
            item.classList.remove('active');
        }
    });
    if (menuItem) {
        menuItem.classList.toggle('active');
    }
});

/* ===== 历史回溯系统 ===== */
const HISTORY_KEY = 'editorHistory';
const MAX_HISTORY = 6;
const SNAPSHOT_INTERVAL = 10 * 60 * 1000; /* 10分钟 */

/* 获取历史快照列表 */
function getEditorHistory() {
    try {
        return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    } catch (e) {
        return [];
    }
}

/* 保存历史快照列表 */
function saveEditorHistory(history) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

/* 创建新快照（由定时器自动调用） */
function takeEditorSnapshot() {
    if (!editor || !editor.getValue) return;
    const content = editor.getValue();
    if (!content.trim()) return;

    const history = getEditorHistory();

    /* 检查与最近一次快照是否相同 */
    if (history.length > 0 && history[history.length - 1].content === content) return;

    /* 检查与当前 autoSave 是否相同（也即未改动） */
    const autoSave = localStorage.getItem('editorAutoSave') || '';
    if (history.length > 0 && autoSave === history[history.length - 1].content) return;

    const now = new Date();
    const timestamp = now.getTime();
    const timeLabel = now.getHours().toString().padStart(2, '0') + ':' +
                      now.getMinutes().toString().padStart(2, '0') + ':' +
                      now.getSeconds().toString().padStart(2, '0');

    const snapshot = {
        content: content,
        timestamp: timestamp,
        label: timeLabel
    };

    history.push(snapshot);

    /* 超出上限则删除最旧的 */
    while (history.length > MAX_HISTORY) {
        history.shift();
    }

    saveEditorHistory(history);
}

/* 打开历史回溯模态框 */
function openHistoryModal() {
    const history = getEditorHistory();

    if (history.length === 0) {
        showError('暂无历史快照');
        return;
    }

    const modalTitle = document.getElementById('dynamicModalTitle');
    const modalBody = document.getElementById('dynamicModalBody');
    const modalFooter = document.getElementById('dynamicModalFooter');

    modalTitle.textContent = '📋 历史回溯';

    let html = '<div style="font-size:13px;color:#666;margin-bottom:12px;">自动每10分钟保存一次，最多保存最近6份（1小时量）。点击条目可恢复到对应版本。</div>';

    /* 以时间倒序显示（最新的在最上面） */
    for (let i = history.length - 1; i >= 0; i--) {
        const snap = history[i];
        const d = new Date(snap.timestamp);
        const dateStr = d.getMonth() + 1 + '/' + d.getDate() + ' ' +
                        d.getHours().toString().padStart(2, '0') + ':' +
                        d.getMinutes().toString().padStart(2, '0') + ':' +
                        d.getSeconds().toString().padStart(2, '0');
        const preview = snap.content.substring(0, 80).replace(/\n/g, ' ');

        html += `<div class="history-item" onclick="restoreSnapshot(${i})">
            <div class="history-item-header">
                <span class="history-item-time">🕐 ${escapeHtml(dateStr)}</span>
                <span class="history-item-label">#${i + 1}</span>
            </div>
            <div class="history-item-preview">${escapeHtml(preview)}${snap.content.length > 80 ? '...' : ''}</div>
        </div>`;
    }

    modalBody.innerHTML = html;
    modalFooter.innerHTML = '<button class="modal-btn modal-btn-danger" onclick="if(confirm(\'确定要清空所有历史快照吗？\')){localStorage.removeItem(\'' + HISTORY_KEY + '\');closeModal(\'dynamicModal\');showSuccess(\'历史已清空\');}">🗑️ 清空历史</button>' +
                            '<button class="modal-btn" onclick="closeModal(\'dynamicModal\')">关闭</button>';
    showModal('dynamicModal');
}

/* 恢复到指定索引的快照 */
function restoreSnapshot(index) {
    const history = getEditorHistory();
    if (index < 0 || index >= history.length) return;

    const snap = history[index];
    const d = new Date(snap.timestamp);

    /* 确认恢复（大文件谨慎） */
    if (!confirm('确定要恢复到 ' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
        d.getHours().toString().padStart(2, '0') + ':' +
        d.getMinutes().toString().padStart(2, '0') + ' 的版本吗？\n\n当前未保存的编辑内容将丢失。')) {
        return;
    }

    setEditorValue(snap.content);
    localStorage.setItem('editorAutoSave', snap.content);
    closeModal('dynamicModal');
    showSuccess('已恢复到 ' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
        d.getHours().toString().padStart(2, '0') + ':' +
        d.getMinutes().toString().padStart(2, '0') + ' 的版本');
}

/* 初始化历史回溯定时器（在编辑器加载后调用） */
function initHistoryTimer() {
    /* 首次启动时先创建一个快照 */
    setTimeout(takeEditorSnapshot, 5000);

    /* 每10分钟创建快照 */
    setInterval(takeEditorSnapshot, SNAPSHOT_INTERVAL);
}
