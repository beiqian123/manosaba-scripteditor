/* --- 脚本解析、阅读模式与语法高亮 ---
 *   parseScript 逐行解析脚本并分类显示(注释/命令/对话/旁白)
 *   支持拖拽排序、从侧边栏拖入工具、双击编辑、悬停操作按钮
 *   extractPrintContent, renderReadingMode 阅读模式渲染
 *   tokenizeCommandLine 逐行高亮与词法分析
 *   getValueClass 值类型颜色分类
 *   依赖: utils.js (escapeHtml, getEditorValue 等) */

/* ========== 文本编辑器操作辅助函数 ========== */

/* 将编辑器的所有内容同步到 localStorage 并刷新当前视图 */
function _syncToEditor() {
    if (editor && editor.getValue) {
        localStorage.setItem('editorAutoSave', editor.getValue());
    }
    /* 刷新当前显示的视图 */
    if (currentEditorTab === 'parsed') {
        parseScript();
    } else if (currentEditorTab === 'reading') {
        renderReadingMode();
    }
}

/* 在编辑器中指定行号插入文本 */
function _insertScriptLine(lineIndex, text) {
    if (!editor) return;
    const content = getEditorValue();
    const lines = content.split('\n');
    if (lineIndex >= lines.length) {
        lines.push(text);
    } else {
        lines.splice(lineIndex, 0, text);
    }
    setEditorValue(lines.join('\n'));
    _syncToEditor();
}

/* 删除编辑器中的指定行 */
function _removeScriptLine(lineIndex) {
    if (!editor) return;
    const content = getEditorValue();
    const lines = content.split('\n');
    if (lineIndex < 0 || lineIndex >= lines.length) return;
    
    /* 检查是否为首个条目列表块行，如果是则删除整个块 */
    const parsedEl = document.querySelector(`#parsedContent .parsed-line[data-line-index="${lineIndex}"]`);
    if (parsedEl && parsedEl.dataset.block === 'item_list') {
        const blockStart = parseInt(parsedEl.dataset.blockStart);
        const blockEnd = parseInt(parsedEl.dataset.blockEnd);
        if (!isNaN(blockStart) && !isNaN(blockEnd) && blockEnd >= blockStart) {
            lines.splice(blockStart, blockEnd - blockStart + 1);
            setEditorValue(lines.join('\n'));
            _syncToEditor();
            return;
        }
    }
    
    lines.splice(lineIndex, 1);
    setEditorValue(lines.join('\n'));
    _syncToEditor();
}

/* 移动编辑器中的行 */
function _moveScriptLine(fromIndex, toIndex) {
    if (!editor || fromIndex === toIndex) return;
    const content = getEditorValue();
    const lines = content.split('\n');
    if (fromIndex < 0 || fromIndex >= lines.length || toIndex < 0 || toIndex >= lines.length) return;
    const [moved] = lines.splice(fromIndex, 1);
    lines.splice(toIndex, 0, moved);
    setEditorValue(lines.join('\n'));
    _syncToEditor();
}

/* 替换编辑器中的指定行 */
function _updateScriptLine(lineIndex, newText) {
    if (!editor) return;
    const content = getEditorValue();
    const lines = content.split('\n');
    if (lineIndex < 0 || lineIndex >= lines.length) return;
    lines[lineIndex] = newText;
    setEditorValue(lines.join('\n'));
    _syncToEditor();
}

/* ========== 脚本解析 ========== */

/* 存储原始行索引到解析行的映射 */
let _parsedLineMap = [];

/* 解析脚本：将纯文本转换为带语法标签的 HTML（含拖拽排序/编辑/删除功能） */
function parseScript() {
    const content = getEditorValue();
    const parsedContent = document.getElementById('parsedContent');

    if (!content.trim()) {
        parsedContent.innerHTML = '<p>请在纯文本编辑模式下输入脚本内容，然后切换到脚本解析模式查看解析结果。</p>';
        _parsedLineMap = [];
        return;
    }

    const lines = content.split('\n');
    let parsedHTML = '';
    _parsedLineMap = [];

    /* 检测所有条目列表块并记录行范围 */
    const itemListBlocks = _findItemListBlocksInLines(lines);
    const itemListBlockLines = new Set(); /* 块内所有行号（含前缀后缀） */
    itemListBlocks.forEach(block => {
        for (let i = block.startLine; i <= block.endLine; i++) {
            itemListBlockLines.add(i);
        }
    });

    /* 拖拽插入指示器容器 */
    parsedHTML += '<div class="parsed-drop-indicator-top" style="height:4px;margin-bottom:2px;"></div>';

    lines.forEach((line, lineIndex) => {
        const trimmed = line.trim();

        /* 跳过条目列表块内部行（仅处理前缀行） */
        const blockDef = itemListBlocks.find(b => b.startLine === lineIndex);
        if (itemListBlockLines.has(lineIndex) && !blockDef) {
            _parsedLineMap.push(lineIndex);
            return;
        }

        if (!trimmed && !blockDef) {
            /* 空行保留占位用于拖入定位 */
            _parsedLineMap.push(lineIndex);
            return;
        }

        let lineType = 'narration';
        let typeText = '旁白';
        let lineHtml = '';
        let cmdName = '';
        let overloadCount = 0;

        /* 条目列表块：渲染为单个复合条目 */
        if (blockDef) {
            const item = blockDef.item;
            const field = blockDef.field;
            const subFields = field.subFields || [];
            const itemTemplate = field.itemTemplate || '';
            const linesInBlock = [];
            for (let i = blockDef.startLine + 1; i < blockDef.endLine; i++) {
                if (lines[i].trim()) linesInBlock.push(lines[i].trim());
            }

            lineType = 'command';
            typeText = item.icon + ' ' + (item.name || '条目列表');
            cmdName = 'item_list';
            overloadCount = 0;

            /* 构建预览：显示前几条条目摘要 */
            let previewHtml = '';
            const prefixEscaped = escapeHtml(blockDef.prefixLine);
            const suffixEscaped = escapeHtml(blockDef.suffixLine);
            previewHtml += `<div style="font-size:12px;color:#6a1b9a;font-weight:600;margin-bottom:4px;">${prefixEscaped}</div>`;
            linesInBlock.slice(0, 4).forEach(l => {
                previewHtml += `<div style="font-size:12px;padding-left:12px;color:#333;">${escapeHtml(l)}</div>`;
            });
            if (linesInBlock.length > 4) {
                previewHtml += `<div style="font-size:11px;color:#888;padding-left:12px;">… 共 ${linesInBlock.length} 条选项</div>`;
            }
            previewHtml += `<div style="font-size:12px;color:#6a1b9a;font-weight:600;margin-top:4px;">${suffixEscaped}</div>`;
            lineHtml = previewHtml;

            parsedHTML += '<div class="parsed-line ' + lineType + '" draggable="true" data-line-index="' + lineIndex + '" data-line-type="' + lineType + '" data-cmd="' + escapeHtml(cmdName) + '" data-block="item_list" data-block-start="' + blockDef.startLine + '" data-block-end="' + blockDef.endLine + '">';
            parsedHTML += '<span class="line-type" style="background:#6a1b9a;color:white;">[' + escapeHtml(typeText) + ']</span>';
            parsedHTML += '<span class="line-content">' + lineHtml + '</span>';
            parsedHTML += '<div class="parsed-actions">';
            parsedHTML += '<button class="parsed-btn parsed-btn-edit" data-line-index="' + lineIndex + '" data-block="item_list" title="编辑">✏️</button>';
            parsedHTML += '<button class="parsed-btn parsed-btn-delete" data-line-index="' + lineIndex + '" data-block="item_list" title="删除">🗑️</button>';
            parsedHTML += '</div>';
            parsedHTML += '</div>';

            for (let i = blockDef.startLine; i <= blockDef.endLine; i++) {
                _parsedLineMap.push(i);
            }
            return;
        }

        if (trimmed.startsWith(';')) {
            lineType = 'comment';
            typeText = '注释';
            lineHtml = `<span class="syntax-comment">${escapeHtml(trimmed.substring(1).trim())}</span>`;
        } else if (trimmed.startsWith('@')) {
            lineType = 'command';
            cmdName = trimmed.substring(1).split(/\s+/)[0];
            const fromConfig = findCommandInConfig(cmdName, trimmed);
            if (fromConfig) {
                typeText = fromConfig.typeText;
                overloadCount = fromConfig.overloads ? fromConfig.overloads.length : 0;
                if (overloadCount > 1) {
                    typeText += ` +${overloadCount - 1}`;
                }
            } else {
                typeText = '命令';
            }
            lineHtml = tokenizeCommandLine(trimmed);
        } else if (/^\S+\s*:/.test(trimmed)) {
            lineType = 'dialogue';
            const parts = trimmed.split(':');
            const character = parts[0].trim();
            const dialogue = parts.slice(1).join(':').trim();
            typeText = '显示对话';
            lineHtml = `<span class="syntax-dialogue-character">${escapeHtml(character)}</span><span class="syntax-operator">:</span><span class="syntax-dialogue-text">${escapeHtml(dialogue)}</span>`;
        } else {
            lineType = 'narration';
            typeText = '旁白';
            lineHtml = `<span class="syntax-narration">${escapeHtml(trimmed)}</span>`;
        }

        parsedHTML += '<div class="parsed-line ' + lineType + '" draggable="true" data-line-index="' + lineIndex + '" data-line-type="' + lineType + '" data-cmd="' + escapeHtml(cmdName) + '">';
        parsedHTML += '<span class="line-type">[' + escapeHtml(typeText) + ']</span>';
        parsedHTML += '<span class="line-content">' + lineHtml + '</span>';

        /* 操作按钮 */
        parsedHTML += '<div class="parsed-actions">';
        parsedHTML += '<button class="parsed-btn parsed-btn-edit" data-line-index="' + lineIndex + '" title="编辑">✏️</button>';
        if (lineType === 'command' && overloadCount > 1) {
            parsedHTML += '<button class="parsed-btn parsed-btn-overload" data-line-index="' + lineIndex + '" data-cmd="' + escapeHtml(cmdName) + '" title="选择重载">选择重载</button>';
        }
        parsedHTML += '<button class="parsed-btn parsed-btn-delete" data-line-index="' + lineIndex + '" title="删除">🗑️</button>';
        parsedHTML += '</div>';

        parsedHTML += '</div>';
        _parsedLineMap.push(lineIndex);
    });

    parsedHTML += '<div class="parsed-drop-indicator-bottom" style="height:4px;margin-top:2px;"></div>';

    parsedContent.innerHTML = parsedHTML;

    /* 绑定事件 */
    _bindParsedLineEvents();
    _bindParsedDropEvents();
}

/* 将 lineIndex 映射到 DOM 中的解析行 */
function _findParsedLineByIndex(lineIndex) {
    return document.querySelector(`#parsedContent .parsed-line[data-line-index="${lineIndex}"]`);
}

/* 绑定解析行的事件（双击编辑、按钮点击、拖拽） */
function _bindParsedLineEvents() {
    const parsedContent = document.getElementById('parsedContent');
    if (!parsedContent) return;

    /* 双击编辑 */
    parsedContent.querySelectorAll('.parsed-line').forEach(lineEl => {
        lineEl.addEventListener('dblclick', function(e) {
            /* 不处理操作按钮上的双击 */
            if (e.target.closest('.parsed-actions')) return;
            const lineIndex = parseInt(this.dataset.lineIndex);
            _editParsedLine(lineIndex);
        });

        /* 拖拽事件 */
        lineEl.addEventListener('dragstart', _onParsedLineDragStart);
        lineEl.addEventListener('dragend', _onParsedLineDragEnd);
        lineEl.addEventListener('dragover', _onParsedLineDragOver);
        lineEl.addEventListener('dragleave', _onParsedLineDragLeave);
        lineEl.addEventListener('drop', _onParsedLineDrop);
    });

    /* 编辑按钮点击 */
    parsedContent.querySelectorAll('.parsed-btn-edit').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const lineIndex = parseInt(this.dataset.lineIndex);
            _editParsedLine(lineIndex);
        });
    });

    /* 删除按钮点击 */
    parsedContent.querySelectorAll('.parsed-btn-delete').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const lineIndex = parseInt(this.dataset.lineIndex);
            if (confirm('确定要删除这一行吗？')) {
                _removeScriptLine(lineIndex);
            }
        });
    });

    /* 重载选择按钮 */
    parsedContent.querySelectorAll('.parsed-btn-overload').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const lineIndex = parseInt(this.dataset.lineIndex);
            _showOverloadSelection(lineIndex);
        });
    });
}

/* ========== 解析行编辑 ========== */

/* 从工具配置中查找实际配置项（带 modal.fields） */
function _findConfigItemByName(itemName) {
    if (!toolsConfig || !toolsConfig.categories) return null;
    for (const cat of toolsConfig.categories) {
        const found = cat.items.find(item => item.name === itemName && item.type === 'modal');
        if (found) return found;
    }
    return null;
}

/* 编辑指定解析行（与 F2 悬浮编辑使用统一逻辑） */
function _editParsedLine(lineIndex) {
    const content = getEditorValue();
    const lines = content.split('\n');
    if (lineIndex < 0 || lineIndex >= lines.length) return;

    /* 检查是否为条目列表块（在 parsed 视图中由 data-block="item_list" 标识） */
    const parsedEl = document.querySelector(`#parsedContent .parsed-line[data-line-index="${lineIndex}"]`);
    if (parsedEl && parsedEl.dataset.block === 'item_list') {
        const blockStart = parseInt(parsedEl.dataset.blockStart);
        const blockEnd = parseInt(parsedEl.dataset.blockEnd);
        if (!isNaN(blockStart) && !isNaN(blockEnd)) {
            /* 使用 editor CodeMirror 实例查找块 */
            const block = typeof findItemListBlockInEditor === 'function' ? findItemListBlockInEditor(editor, blockStart) : null;
            if (block) {
                currentEditPos = { line: block.startLine, endLine: block.endLine };
                openDynamicModal(block.item.name, block.itemListData);
                return;
            }
        }
    }

    const lineText = lines[lineIndex].trim();

    /* 检查是否为 @命令 行 */
    if (lineText.startsWith('@')) {
        const cmd = lineText.substring(1).split(/\s+/)[0];

        /* 使用 findCommandInConfig 查找匹配项（与 F2 悬浮编辑统一） */
        const cmdResult = findCommandInConfig(cmd, lineText);
        if (cmdResult && cmdResult.typeText) {
            const itemName = cmdResult.typeText;

            /* 从 toolsConfig 中找到实际的配置项（含 modal.fields） */
            const configItem = _findConfigItemByName(itemName);
            if (configItem && configItem.type === 'modal') {
                const parsedValues = parseLineFieldValues(lineText, configItem);
                currentEditPos = { line: lineIndex };
                openDynamicModal(itemName, parsedValues);
                return;
            }
        }
    }

    /* 对话行编辑：仅当冒号前是单个无空格标识符时才视为对话 */
    if (/^\S+\s*:/.test(lineText) && !lineText.startsWith(';') && !lineText.startsWith('@')) {
        const parts = lineText.split(':');
        const character = parts[0].trim();
        const dialogue = parts.slice(1).join(':').trim();

        const modalTitle = document.getElementById('dynamicModalTitle');
        const modalBody = document.getElementById('dynamicModalBody');
        const modalFooter = document.getElementById('dynamicModalFooter');

        modalTitle.textContent = '编辑对话';
        let bodyHtml = '<div class="form-group"><label>角色名</label>';
        bodyHtml += `<input type="text" id="edit_dialogue_char" value="${escapeHtml(character)}" placeholder="角色名">`;
        bodyHtml += '</div><div class="form-group"><label>对话内容</label>';
        bodyHtml += `<textarea id="edit_dialogue_text" rows="3" placeholder="对话内容">${escapeHtml(dialogue)}</textarea>`;
        bodyHtml += '</div>';
        modalBody.innerHTML = bodyHtml;

        currentEditPos = { line: lineIndex, type: 'dialogue' };
        modalFooter.innerHTML = `
            <button class="modal-btn modal-btn-secondary" onclick="closeModal('dynamicModal')">取消</button>
            <button class="modal-btn modal-btn-primary" onclick="_submitDialogueEdit()">修改</button>
        `;
        showModal('dynamicModal');
        return;
    }

    /* 旁白/注释行编辑 */
    const modalTitle = document.getElementById('dynamicModalTitle');
    const modalBody = document.getElementById('dynamicModalBody');
    const modalFooter = document.getElementById('dynamicModalFooter');

    modalTitle.textContent = lineText.startsWith(';') ? '编辑注释' : '编辑旁白';
    let bodyHtml = '<div class="form-group"><label>文本内容</label>';
    bodyHtml += `<textarea id="edit_textarea" rows="4" placeholder="文本内容">${escapeHtml(lineText.startsWith(';') ? lineText.substring(1).trim() : lineText)}</textarea>`;
    bodyHtml += '</div>';
    modalBody.innerHTML = bodyHtml;

    currentEditPos = { line: lineIndex, type: lineText.startsWith(';') ? 'comment' : 'narration' };
    modalFooter.innerHTML = `
        <button class="modal-btn modal-btn-secondary" onclick="closeModal('dynamicModal')">取消</button>
        <button class="modal-btn modal-btn-primary" onclick="_submitTextEdit()">修改</button>
    `;
    showModal('dynamicModal');
}

/* 提交对话编辑 */
function _submitDialogueEdit() {
    const character = document.getElementById('edit_dialogue_char').value.trim();
    const dialogue = document.getElementById('edit_dialogue_text').value.trim();
    if (!character || !dialogue) {
        showError('角色名和对话内容不能为空');
        return;
    }
    const newLine = character + ': ' + dialogue;
    _updateScriptLine(currentEditPos.line, newLine);
    closeModal('dynamicModal');
    showSuccess('对话已更新');
}

/* 提交旁白/注释编辑 */
function _submitTextEdit() {
    const text = document.getElementById('edit_textarea').value.trim();
    if (!text) {
        showError('内容不能为空');
        return;
    }
    let newLine = text;
    if (currentEditPos.type === 'comment') {
        newLine = '; ' + text;
    }
    _updateScriptLine(currentEditPos.line, newLine);
    closeModal('dynamicModal');
    showSuccess('内容已更新');
}

/* 显示重载选择（弹出重载工具列表，编辑逻辑与 F2 统一） */
function _showOverloadSelection(lineIndex) {
    const content = getEditorValue();
    const lines = content.split('\n');
    const lineText = lines[lineIndex].trim();
    const overloads = getCommandOverloadsFromLine(lineText);
    if (!overloads || overloads.length <= 1) return;

    const sortedOverloads = findBestOverloadMatch(overloads, lineText);

    const modalTitle = document.getElementById('dynamicModalTitle');
    const modalBody = document.getElementById('dynamicModalBody');
    const modalFooter = document.getElementById('dynamicModalFooter');

    modalTitle.textContent = '选择重载工具';
    let bodyHtml = '<div style="max-height:400px;overflow-y:auto;">';
    sortedOverloads.forEach((overload, idx) => {
        const icon = overload.icon || '';
        bodyHtml += `<div class="parsed-overload-item" style="padding:10px 12px;margin-bottom:6px;border:1px solid #ddd;border-radius:6px;cursor:pointer;transition:all 0.15s;" 
            data-overload-idx="${idx}" data-overload-name="${escapeHtml(overload.name)}"
            onmouseenter="this.style.background='#f0e6ff';this.style.borderColor='#6a1b9a'"
            onmouseleave="this.style.background='white';this.style.borderColor='#ddd'">`;
        bodyHtml += `<div style="font-weight:600;">${icon} ${escapeHtml(overload.name)}</div>`;
        bodyHtml += `<div style="font-size:12px;color:#888;margin-top:2px;">${escapeHtml(overload.categoryName || '')}</div>`;
        bodyHtml += `<code style="font-size:11px;color:#6a1b9a;display:block;margin-top:4px;">${escapeHtml(overload.output)}</code>`;
        bodyHtml += '</div>';
    });
    bodyHtml += '</div>';
    modalBody.innerHTML = bodyHtml;

    modalFooter.innerHTML = `<button class="modal-btn modal-btn-secondary" onclick="closeModal('dynamicModal')">取消</button>`;
    showModal('dynamicModal');

    /* 绑定重载项点击 */
    modalBody.querySelectorAll('.parsed-overload-item').forEach(item => {
        item.addEventListener('click', function() {
            const overloadName = this.dataset.overloadName;
            /* 使用 _findConfigItemByName 获取实际配置项（含 modal.fields），与 F2 逻辑统一 */
            const configItem = _findConfigItemByName(overloadName);
            if (configItem && configItem.type === 'modal') {
                const parsedValues = parseLineFieldValues(lines[lineIndex].trim(), configItem);
                currentEditPos = { line: lineIndex };
                closeModal('dynamicModal');
                openDynamicModal(overloadName, parsedValues);
            }
        });
    });
}

/* ========== 解析行拖拽排序 ========== */

let _dragSourceIndex = null;
let _dragSourceIsSidebar = false;
let _dragSidebarItemName = null;
let _dragSidebarOutput = null;

function _onParsedLineDragStart(e) {
    _dragSourceIndex = parseInt(this.dataset.lineIndex);
    _dragSourceIsSidebar = false;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.lineIndex);

    /* 显示删除区域 */
    const deleteZone = document.getElementById('deleteDropZone');
    if (deleteZone) deleteZone.classList.add('show');
}

function _onParsedLineDragEnd(e) {
    this.classList.remove('dragging');
    _dragSourceIndex = null;
    _dragSourceIsSidebar = false;
    /* 隐藏删除区域 */
    const deleteZone = document.getElementById('deleteDropZone');
    if (deleteZone) deleteZone.classList.remove('show');
    /* 清除所有高亮 */
    document.querySelectorAll('#parsedContent .parsed-line').forEach(el => {
        el.classList.remove('drag-over', 'drag-over-end');
    });
}

function _onParsedLineDragOver(e) {
    e.preventDefault();
    if (!_dragSourceIsSidebar && _dragSourceIndex === null) return;
    e.dataTransfer.dropEffect = 'move';

    const rect = this.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    this.classList.remove('drag-over', 'drag-over-end');
    if (e.clientY < midY) {
        this.classList.add('drag-over');
    } else {
        this.classList.add('drag-over-end');
    }
}

function _onParsedLineDragLeave(e) {
    this.classList.remove('drag-over', 'drag-over-end');
}

function _onParsedLineDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    this.classList.remove('drag-over', 'drag-over-end');

    const targetIndex = parseInt(this.dataset.lineIndex);
    const rect = this.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const insertAfter = e.clientY >= midY;

    if (_dragSourceIsSidebar && _dragSidebarItemName) {
        /* 从侧边栏拖入工具 */
        let insertIndex = insertAfter ? targetIndex + 1 : targetIndex;
        /* 找到真实的行号位置 */
        const content = getEditorValue();
        const allLines = content.split('\n');
        if (insertAfter) {
            /* 在目标行之后插入 */
            insertIndex = targetIndex + 1;
            /* 跳过空行 */
            while (insertIndex < allLines.length && !allLines[insertIndex].trim()) {
                insertIndex++;
            }
        } else {
            insertIndex = targetIndex;
        }
        _handleSidebarDrop(insertIndex);
        return;
    }

    if (!_dragSourceIsSidebar && _dragSourceIndex !== null) {
        /* 内部拖拽重排序 */
        let toIndex = insertAfter ? targetIndex + 1 : targetIndex;
        if (_dragSourceIndex < toIndex) toIndex--;
        if (_dragSourceIndex !== toIndex) {
            _moveScriptLine(_dragSourceIndex, toIndex);
        }
    }
}

/* ========== 解析区接收侧边栏拖入 ========== */

function _bindParsedDropEvents() {
    const parsedContent = document.getElementById('parsedContent');
    if (!parsedContent) return;

    /* 顶部指示器 */
    const topIndicator = parsedContent.querySelector('.parsed-drop-indicator-top');
    const bottomIndicator = parsedContent.querySelector('.parsed-drop-indicator-bottom');

    /* 整个解析区接收拖入 */
    parsedContent.addEventListener('dragenter', function(e) {
        e.preventDefault();
        if (_dragSourceIsSidebar) {
            this.classList.add('drag-hover');
        }
    });

    parsedContent.addEventListener('dragover', function(e) {
        e.preventDefault();
        if (_dragSourceIsSidebar) {
            e.dataTransfer.dropEffect = 'copy';
        }
    });

    parsedContent.addEventListener('dragleave', function(e) {
        if (e.target === this) {
            this.classList.remove('drag-hover');
        }
    });

    parsedContent.addEventListener('drop', function(e) {
        e.preventDefault();
        this.classList.remove('drag-hover');
        if (!_dragSourceIsSidebar) return;

        /* 尝试找到最近的解析行来定位插入位置 */
        const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
        const parsedLine = dropTarget ? dropTarget.closest('.parsed-line') : null;
        if (parsedLine) {
            /* 由行的 drop 事件处理 */
            return;
        }

        /* 否则插入到末尾 */
        const content = getEditorValue();
        const lines = content.split('\n');
        _handleSidebarDrop(lines.length);
    });

    /* 底部指示器拖放 */
    if (bottomIndicator) {
        bottomIndicator.addEventListener('dragover', function(e) {
            e.preventDefault();
            if (_dragSourceIsSidebar) {
                e.dataTransfer.dropEffect = 'copy';
                this.style.height = '12px';
                this.style.background = '#6a1b9a';
                this.style.borderRadius = '2px';
            }
        });
        bottomIndicator.addEventListener('dragleave', function(e) {
            this.style.height = '4px';
            this.style.background = '';
        });
        bottomIndicator.addEventListener('drop', function(e) {
            e.preventDefault();
            this.style.height = '4px';
            this.style.background = '';
            if (_dragSourceIsSidebar) {
                const content = getEditorValue();
                _handleSidebarDrop(content.split('\n').length);
            }
        });
    }

    /* 顶部指示器拖放 */
    if (topIndicator) {
        topIndicator.addEventListener('dragover', function(e) {
            e.preventDefault();
            if (_dragSourceIsSidebar) {
                e.dataTransfer.dropEffect = 'copy';
                this.style.height = '12px';
                this.style.background = '#6a1b9a';
                this.style.borderRadius = '2px';
            }
        });
        topIndicator.addEventListener('dragleave', function(e) {
            this.style.height = '4px';
            this.style.background = '';
        });
        topIndicator.addEventListener('drop', function(e) {
            e.preventDefault();
            this.style.height = '4px';
            this.style.background = '';
            if (_dragSourceIsSidebar) {
                _handleSidebarDrop(0);
            }
        });
    }
}

/* 处理侧边栏工具拖入 */
function _handleSidebarDrop(insertIndex) {
    if (!_dragSidebarItemName) return;

    const category = toolsConfig.categories.find(c =>
        c.items.some(item => item.name === _dragSidebarItemName)
    );
    if (!category) return;

    const item = category.items.find(i => i.name === _dragSidebarItemName);
    if (!item) return;

    currentEditPos = { line: insertIndex, isNew: true };

    if (item.type === 'direct' && item.output) {
        /* 直接插入 */
        _insertScriptLine(insertIndex, item.output);
        showSuccess('已插入: ' + item.name);
    } else if (item.type === 'modal') {
        /* 弹出模态框让用户填写 */
        openDynamicModal(item.name);
    }

    /* 重置侧边栏拖拽状态 */
    _dragSourceIsSidebar = false;
    _dragSidebarItemName = null;
    _dragSidebarOutput = null;
}

/* ========== 删除拖放区域 ========== */

/* 页面加载后创建删除区域 */
function _ensureDeleteZone() {
    if (document.getElementById('deleteDropZone')) return;
    const zone = document.createElement('div');
    zone.id = 'deleteDropZone';
    zone.className = 'delete-zone';
    zone.textContent = '🗑️ 删除';
    zone.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        this.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', function(e) {
        this.classList.remove('drag-over');
    });
    zone.addEventListener('drop', function(e) {
        e.preventDefault();
        this.classList.remove('drag-over');
        this.classList.remove('show');
        if (_dragSourceIndex !== null && !_dragSourceIsSidebar) {
            if (confirm('确定要删除这一行吗？')) {
                _removeScriptLine(_dragSourceIndex);
            }
        }
        _dragSourceIndex = null;
    });
    document.body.appendChild(zone);
}

/* ========== 侧边栏工具拖拽（在 renderToolsFromConfig 之后调用） ========== */

/* 为侧边栏工具块添加拖拽支持 */
function _makeSidebarItemsDraggable() {
    document.querySelectorAll('#tools-container .snippet').forEach(snippet => {
        snippet.setAttribute('draggable', 'true');
        snippet.addEventListener('dragstart', function(e) {
            /* 使用 data-item-name 属性获取准确的工具名 */
            const itemName = this.getAttribute('data-item-name') || '';
            if (!itemName) return;
            _dragSourceIsSidebar = true;
            _dragSourceIndex = null;
            _dragSidebarItemName = itemName;
            this.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.setData('text/plain', itemName);

            /* 显示删除区域 */
            const deleteZone = document.getElementById('deleteDropZone');
            if (deleteZone) deleteZone.classList.add('show');
        });
        snippet.addEventListener('dragend', function(e) {
            this.classList.remove('dragging');
            _dragSourceIsSidebar = false;
            _dragSidebarItemName = null;
            _dragSidebarOutput = null;
            const deleteZone = document.getElementById('deleteDropZone');
            if (deleteZone) deleteZone.classList.remove('show');
        });
    });
}

/* ========== 提交动态模态框时处理新插入 ========== */

/* 重写 submitDynamicModal 或在其之后处理 */
let _originalSubmitDynamicModal = null;

/* 包装 submitDynamicModal，在新插入模式下插入到指定行而不是编辑器光标位置 */
function _wrapSubmitDynamicModal() {
    if (typeof submitDynamicModal === 'function' && !_originalSubmitDynamicModal) {
        _originalSubmitDynamicModal = submitDynamicModal;
        submitDynamicModal = function() {
            if (currentEditPos && currentEditPos.isNew && currentModalConfig) {
                /* 侧边栏拖入：生成输出并插入到指定行 */
                if (!currentModalConfig || !currentModalConfig.modal) {
                    if (_originalSubmitDynamicModal) _originalSubmitDynamicModal();
                    return;
                }

                /* 收集字段值 */
                const fields = currentModalConfig.modal.fields;
                const fieldValues = [];
                let hasError = false;

                /* 清除之前的高亮 */
                document.querySelectorAll('#dynamicModal .form-group input, #dynamicModal .form-group select').forEach(el => {
                    el.style.borderColor = '';
                });

                fields.forEach((field, index) => {
                    const fieldId = 'modal_field_' + index;
                    let value = '';

                    if (field.type === 'checkbox') {
                        const checkboxEl = document.getElementById(fieldId);
                        if (checkboxEl && checkboxEl.checked) {
                            value = field.checkedValue || 'true';
                        } else {
                            const uncheckedInput = document.getElementById(fieldId + '_unchecked');
                            value = uncheckedInput ? uncheckedInput.value : (field.uncheckedValue || 'false');
                        }
                    } else if (field.type === 'selectable' || field.type === 'dropdown_custom') {
                        const selectEl = document.getElementById(fieldId + '_select');
                        const inputEl = document.getElementById(fieldId);
                        if (selectEl && selectEl.style.display !== 'none' && selectEl.value && selectEl.value !== '__custom__') {
                            value = selectEl.value;
                        } else if (inputEl) {
                            value = inputEl.value;
                        }
                    } else {
                        const el = document.getElementById(fieldId);
                        if (el) value = el.value || '';
                    }

                    if (field.required && !value.trim()) {
                        const el = document.getElementById(fieldId);
                        if (el) {
                            el.style.borderColor = '#ff0000';
                            el.setAttribute('title', '请填写 ' + field.name);
                        }
                        hasError = true;
                    }

                    fieldValues.push(value);
                });

                if (hasError) {
                    showError('请填写必填项（标红字段）');
                    return;
                }

                /* 生成输出 */
                let output = currentModalConfig.modal.output;
                fieldValues.forEach((val, i) => {
                    output = output.replace(new RegExp('\\{' + (i + 1) + '\\}', 'g'), val);
                });

                /* 处理可选字段 */
                const hasOptional = fields.some(f => f.fieldCategory === 'optional');
                if (hasOptional) {
                    let baseOutput = currentModalConfig.modal.output;
                    let requiredCount = 0;
                    fields.forEach((field, index) => {
                        if (field.fieldCategory !== 'optional') {
                            requiredCount++;
                            baseOutput = baseOutput.replace(new RegExp('\\{' + requiredCount + '\\}', 'g'), fieldValues[index]);
                        }
                    });
                    const parts = [baseOutput];
                    fields.forEach((field, index) => {
                        if (field.fieldCategory === 'optional' && fieldValues[index] && fieldValues[index].trim()) {
                            let fieldOutput = field.outputTemplate || '';
                            if (fieldOutput) {
                                fieldOutput = fieldOutput.replace(/\{N\}/g, fieldValues[index]);
                                parts.push(fieldOutput);
                            }
                        }
                    });
                    output = parts.join(' ');
                }

                /* 插入到指定行号 */
                const insertIndex = currentEditPos.line;
                closeModal('dynamicModal');
                _insertScriptLine(insertIndex, output);
                showSuccess('已插入: ' + currentModalConfig.name);
                return;
            }

            /* 原有编辑模式 */
            if (_originalSubmitDynamicModal) {
                _originalSubmitDynamicModal();
                /* 编辑完成后刷新当前视图 */
                if (currentEditorTab === 'parsed') {
                    parseScript();
                } else if (currentEditorTab === 'reading') {
                    renderReadingMode();
                }
                localStorage.setItem('editorAutoSave', editor.getValue());
            }
        };
    }
}

/* ========== 阅读模式（含悬停编辑） ========== */

/* 从 @print 行提取文本和作者 */
function extractPrintContent(line) {
    const textMatch = line.match(/@print\s+"([^"]*)"/i);
    const text = textMatch ? textMatch[1] : '';
    const authorMatch = line.match(/Author\s*:\s*"([^"]*)"/i);
    const author = authorMatch ? authorMatch[1] : '';
    return { text, author };
}

/* 渲染阅读模式（将脚本转换为阅读友好格式，含悬停编辑功能） */
function renderReadingMode() {
    const content = getEditorValue();
    const readingContent = document.getElementById('readingContent');

    if (!content.trim()) {
        readingContent.innerHTML = '<p>请在纯文本编辑模式下输入脚本内容，然后切换到阅读模式查看。</p>';
        return;
    }

    const showScriptInfo = getCookie('readingScriptInfo') === 'true';

    const lines = content.split('\n');
    let output = '<div class="reading-lines">';
    let prevLineEmpty = false;

    lines.forEach((line, lineIndex) => {
        const trimmed = line.trim();
        if (!trimmed) {
            if (!prevLineEmpty) {
                output += '<div class="reading-spacer"></div>';
                prevLineEmpty = true;
            }
            return;
        }
        prevLineEmpty = false;

        if (trimmed.startsWith(';')) {
            return;
        }

        if (trimmed.startsWith('@')) {
            const cmdMatch = trimmed.match(/^@(\w+)/);
            if (!cmdMatch) return;
            const cmd = cmdMatch[1].toLowerCase();

            if (cmd === 'print') {
                const { text, author } = extractPrintContent(trimmed);
                if (!text) return;
                const cleanText = text.replace(/<br\s*\/?>/gi, '');
                if (author) {
                    output += `<div class="reading-line reading-dialogue" data-line-index="${lineIndex}">`;
                    output += '<span class="reading-character">' + escapeHtml(author) + '</span>';
                    output += '<span class="reading-quote">：「</span>';
                    output += '<span class="reading-dialogue-text">' + escapeHtml(cleanText) + '</span>';
                    output += '<span class="reading-quote">」</span>';
                    output += '<span class="reading-edit-tooltip" data-line-index="' + lineIndex + '">✏️ 编辑此处</span>';
                    output += '</div>';
                } else {
                    output += `<div class="reading-line reading-narration" data-line-index="${lineIndex}">`;
                    output += escapeHtml(cleanText);
                    output += '<span class="reading-edit-tooltip" data-line-index="' + lineIndex + '">✏️ 编辑此处</span>';
                    output += '</div>';
                }
            } else if (showScriptInfo) {
                const fromConfig = findCommandInConfig(cmd, trimmed);
                const displayName = fromConfig ? fromConfig.typeText : cmd;
                const afterCmd = trimmed.slice(cmdMatch[0].length).trim();
                const firstArgMatch = afterCmd.match(/^"([^"]*)"|^'([^']*)'|^(\S+)/);
                const firstArg = firstArgMatch ? (firstArgMatch[1] || firstArgMatch[2] || firstArgMatch[3]) : '';
                const infoText = firstArg ? displayName + ' ' + firstArg : displayName;
                output += `<div class="reading-line reading-script-info" data-line-index="${lineIndex}">`;
                output += '[' + escapeHtml(infoText) + ']';
                output += '<span class="reading-edit-tooltip" data-line-index="' + lineIndex + '">✏️ 编辑此处</span>';
                output += '</div>';
            }
            return;
        }

        if (/^\S+\s*:/.test(trimmed)) {
            const parts = trimmed.split(':');
            const character = parts[0].trim();
            const dialogue = parts.slice(1).join(':').trim().replace(/<br\s*\/?>/gi, '');
            if (dialogue) {
                output += `<div class="reading-line reading-dialogue" data-line-index="${lineIndex}">`;
                output += '<span class="reading-character">' + escapeHtml(character) + '</span>';
                output += '<span class="reading-quote">：「</span>';
                output += '<span class="reading-dialogue-text">' + escapeHtml(dialogue) + '</span>';
                output += '<span class="reading-quote">」</span>';
                output += '<span class="reading-edit-tooltip" data-line-index="' + lineIndex + '">✏️ 编辑此处</span>';
                output += '</div>';
            }
            return;
        }

        const cleanNarration = trimmed.replace(/<br\s*\/?>/gi, '');
        if (!cleanNarration) return;
        output += `<div class="reading-line reading-narration" data-line-index="${lineIndex}">`;
        output += escapeHtml(cleanNarration);
        output += '<span class="reading-edit-tooltip" data-line-index="' + lineIndex + '">✏️ 编辑此处</span>';
        output += '</div>';
    });

    output += '</div>';
    readingContent.innerHTML = output;

    /* 绑定阅读模式悬停编辑 */
    _bindReadingEditEvents();
}

/* 绑定阅读模式悬停编辑事件（悬停2秒显示，离开2秒后关闭） */
function _bindReadingEditEvents() {
    const readingContent = document.getElementById('readingContent');
    if (!readingContent) return;

    readingContent.querySelectorAll('.reading-line').forEach(lineEl => {
        const tooltip = lineEl.querySelector('.reading-edit-tooltip');
        if (!tooltip) return;

        let showTimer = null;
        let hideTimer = null;

        lineEl.addEventListener('mouseenter', function() {
            clearTimeout(hideTimer);
            hideTimer = null;
            showTimer = setTimeout(() => {
                tooltip.style.display = 'block';
            }, 800);
        });

        lineEl.addEventListener('mouseleave', function() {
            clearTimeout(showTimer);
            showTimer = null;
            hideTimer = setTimeout(() => {
                tooltip.style.display = 'none';
            }, 2000);
        });

        tooltip.addEventListener('click', function(e) {
            e.stopPropagation();
            const lineIndex = parseInt(this.dataset.lineIndex);
            /* 直接弹出编辑窗，不切换标签页 */
            _editParsedLine(lineIndex);
        });
    });
}

/* ========== 语法高亮工具函数 ========== */

/* 将 Command 行进行语法标记 */
function tokenizeCommandLine(line) {
    const trimmed = line.slice(1).trim();
    const cmdMatch = trimmed.match(/^([^\s]+)/);
    if (!cmdMatch) {
        return escapeHtml(line);
    }

    const cmd = cmdMatch[1];
    const rest = trimmed.slice(cmd.length);

    /* 匹配 key: value 属性：支持 "双引号" '单引号' 或无引号三种值格式 */
    const attrRegex = /\s*([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(?:("([^"]*)")|(\'([^']*)\')|([^\s]+))/g;
    let result = `<span class=\"syntax-at\">@</span><span class=\"syntax-command-name\">${escapeHtml(cmd)}</span>`;
    let lastIndex = 0;
    let match;

    while ((match = attrRegex.exec(rest)) !== null) {
        const prefix = rest.slice(lastIndex, match.index);
        result += escapeHtml(prefix);

        const key = match[1];
        const rawValue = match[3] ?? match[5] ?? match[6] ?? '';
        const isQuoted = !!(match[2] || match[4]);
        const valueText = match[2] || match[4] || rawValue;
        const valueClass = getValueClass(rawValue, isQuoted);
        const displayValue = isQuoted ? `${match[2] || match[4]}` : rawValue;

        result += `<span class=\"syntax-attr-key\">${escapeHtml(key)}</span><span class=\"syntax-attr-operator\">:</span>`;
        result += `<span class=\"${valueClass}\">${escapeHtml(displayValue)}</span>`;
        lastIndex = attrRegex.lastIndex;
    }

    result += escapeHtml(rest.slice(lastIndex));
    return result;
}

/* 获取属性值的 CSS 类名（数字/字符串/布尔/普通） */
function getValueClass(value, quoted) {
    if (quoted) return 'syntax-string';
    if (/^(true|false)$/i.test(value)) return 'syntax-boolean';
    if (/^[+-]?[0-9]+([\.,][0-9]+)*$/.test(value)) return 'syntax-number';
    return 'syntax-identifier';
}

/* ========== 条目列表块检测 ========== */

/* 从 lines 数组中检测所有条目列表块（返回 { item, field, startLine, endLine, prefixLine, suffixLine }） */
function _findItemListBlocksInLines(lines) {
    if (!toolsConfig || !toolsConfig.categories) return [];
    const blocks = [];

    for (const category of toolsConfig.categories) {
        for (const item of category.items) {
            if (item.type !== 'modal' || !item.modal || !item.modal.fields) continue;
            for (const field of item.modal.fields) {
                if (field.type !== 'item_list') continue;
                const blockPrefix = (field.blockPrefix || '').trim();
                const blockSuffix = (field.blockSuffix || '').trim();
                if (!blockPrefix || !blockSuffix) continue;

                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].trim() === blockPrefix) {
                        for (let j = i + 1; j < lines.length && j <= i + 50; j++) {
                            if (lines[j].trim() === blockSuffix) {
                                blocks.push({
                                    item,
                                    field,
                                    startLine: i,
                                    endLine: j,
                                    prefixLine: blockPrefix,
                                    suffixLine: blockSuffix
                                });
                                i = j; /* 跳过已匹配的块 */
                                break;
                            }
                        }
                    }
                }
            }
        }
    }
    return blocks;
}

/* ========== 初始化 ========== */

/* 页面加载后初始化拖拽和编辑器包装 */
(function _initReadingEnhancements() {
    /* 确保删除区域存在 */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            _ensureDeleteZone();
        });
    } else {
        _ensureDeleteZone();
    }

    /* 包装 submitDynamicModal */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            _wrapSubmitDynamicModal();
        });
    } else {
        _wrapSubmitDynamicModal();
    }
})();
