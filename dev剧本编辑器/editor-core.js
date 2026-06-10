/* --- 编辑器核心：语法模式、代码补全、标签切换 ---
 *   defineGameScriptMode 定义 CodeMirror 语法模式
 *   getGameScriptCommands, gameScriptHint @命令自动补全
 *   quickInputHint 快速输入补全
 *   switchTab, switchSidebarContent, switchEditorTab 标签页切换
 *   文件导入监听 (fileInput change 事件)
 *   依赖: utils.js (editor, toolsConfig 等全局变量) */

defineGameScriptMode();
loadQuickInputItems();

document.getElementById('fileInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        setEditorValue(e.target.result);
        clearSearch();
        showSuccess('剧本导入成功！');
    };
    reader.onerror = function() {
        showError('文件读取失败！');
    };
    reader.readAsText(file, 'UTF-8');
});

/* 定义 GameScript CodeMirror 语法模式 */
function defineGameScriptMode() {
    if (!window.CodeMirror || !CodeMirror.defineSimpleMode) return;

    CodeMirror.defineSimpleMode('gamescript', {
        start: [
            { regex: /^;.*$/, token: 'comment' },
            { regex: /@\w+/, token: 'keyword' },
            { regex: /(?:[A-Za-z_][A-Za-z0-9_-]*)(?=\s*:)/, token: 'atom' },
            { regex: /"(?:[^\\"]|\\.)*"/, token: 'string' },
            { regex: /\{[^}]*\}/, token: 'variable' },
            { regex: /\b(?:true|false)\b/i, token: 'bool' },
            { regex: /[+-]?[0-9]+(?:\.[0-9]+)?/, token: 'number' },
            { regex: /<[^>]+>/, token: 'html-muted' },
            { regex: /:/, token: 'operator' },
            { regex: /./, token: null }
        ],
        meta: {
            dontIndentStates: ['comment'],
            lineComment: ';'
        }
    });
}

/* 从配置获取 GameScript 命令列表 */
function getGameScriptCommands() {
    const commands = [];
    if (!toolsConfig || !toolsConfig.categories) return commands;

    for (const category of toolsConfig.categories) {
        for (const item of category.items) {
            let output = '';
            if (item.type === 'modal' && item.modal && item.modal.output) {
                output = item.modal.output;
            } else if (item.type === 'direct' && item.output) {
                output = item.output;
            }

            if (output && output.startsWith('@')) {
                const cmdName = output.slice(1).split(/\s/)[0];
                if (cmdName && !commands.includes(cmdName)) {
                    commands.push(cmdName);
                }
            }
        }
    }
    return commands.sort();
}

/* CodeMirror @命令自动补全 */
function gameScriptHint(cm) {
    const cur = cm.getCursor();
    const token = cm.getTokenAt(cur);

    const line = cm.getLine(cur.line);
    const linePart = line.substring(0, cur.ch);

    if (!linePart.includes('@')) {
        return;
    }

    const atIndex = linePart.lastIndexOf('@');
    const searchTerm = linePart.substring(atIndex + 1);

    const commands = getGameScriptCommands();
    if (commands.length === 0) return;

    const filtered = commands.filter(cmd =>
        cmd.toLowerCase().startsWith(searchTerm.toLowerCase())
    );

    if (filtered.length === 0) return;

    const displayList = filtered.map(cmd => {
        let displayText = '@' + cmd;
        let itemName = '';

        for (const category of toolsConfig.categories) {
            for (const item of category.items) {
                let output = '';
                if (item.type === 'modal' && item.modal && item.modal.output) {
                    output = item.modal.output;
                } else if (item.type === 'direct' && item.output) {
                    output = item.output;
                }

                if (output && output.startsWith('@' + cmd)) {
                    itemName = item.name;
                    break;
                }
            }
            if (itemName) break;
        }

        return {
            text: '@' + cmd,
            displayText: itemName ? `@${cmd} → ${itemName}` : '@' + cmd,
            className: ''
        };
    });

    if (displayList.length > 0) {
        displayList.push({
            text: '__hint__',
            displayText: '▼ 按 Tab 或 Enter 补全',
            className: 'CodeMirror-hint-tab-hint'
        });
    }

    return {
        list: displayList,
        from: CodeMirror.Pos(cur.line, atIndex),
        to: cur
    };
}

CodeMirror.registerHelper('hint', 'gamescript', gameScriptHint);

function quickInputHint(cm) {
    if (!quickInputItems || quickInputItems.length === 0) return;

    const cur = cm.getCursor();
    const line = cm.getLine(cur.line);
    const linePart = line.substring(0, cur.ch);

    const maxItemLen = Math.max(...quickInputItems.map(i => i.length));

    for (let start = Math.max(0, linePart.length - maxItemLen); start < linePart.length; start++) {
        const candidate = linePart.substring(start);
        const filtered = quickInputItems.filter(item =>
            item.toLowerCase().startsWith(candidate.toLowerCase())
        );
        if (filtered.length > 0) {
            const from = CodeMirror.Pos(cur.line, start);
            return {
                list: filtered.map(text => ({ text: text, displayText: text })),
                from: from,
                to: cur
            };
        }
    }
}

/* 侧边栏子面板切换（日常模式/可编辑分组） */
function switchTab(tabName) {
    const tabContents = document.getElementsByClassName('tab-content');
    for (let i = 0; i < tabContents.length; i++) {
        tabContents[i].style.display = 'none';
    }

    const tabButtons = document.getElementsByClassName('tab-button');
    for (let i = 0; i < tabButtons.length; i++) {
        tabButtons[i].classList.remove('active');
    }

    document.getElementById(tabName + '-tab').style.display = 'block';

    event.currentTarget.classList.add('active');
}

/* 切换编辑器底部标签页（编辑/解析/阅读） */
function switchEditorTab(tabName) {
    currentEditorTab = tabName;

    const tabContents = document.getElementsByClassName('editor-tab-content');
    for (let i = 0; i < tabContents.length; i++) {
        tabContents[i].style.display = 'none';
    }

    const tabButtons = document.querySelectorAll('.editor-tabs .tab-button');
    for (let i = 0; i < tabButtons.length; i++) {
        tabButtons[i].classList.remove('active');
    }

    document.getElementById(tabName + '-tab').style.display = 'flex';

    /* 高亮当前按钮 */
    const activeBtn = document.querySelector(`.editor-tabs .tab-button[onclick*="${tabName}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }

    if (tabName === 'parsed') {
        parseScript();
    } else if (tabName === 'reading') {
        renderReadingMode();
    }
}
