/* --- 分类快速输入 ---
 *   支持按分组管理词条，每个分组有一个触发前缀
 *   在编辑器中输入前缀字符即可弹出该分组的所有词条
 *   支持拼音首字母筛选、上下键选择、Tab/Enter插入
 *   依赖: utils.js (editor, escapeHtml, showModal, closeModal, showSuccess, showError) */

let quickCategoryGroups = [];
let PINYIN_INITIAL_MAP = {};
let categoryHintTimer = null;
let categoryHintActive = false;
let activeCategoryPrefix = null;
let pinyinMapLoaded = false;

const CATEGORY_STORAGE_KEY = 'quickCategoryGroups';
const PINYIN_CSV_PATH = 'dev剧本编辑器/pinyin-map.csv';

/* 从 CSV 加载拼音首字母映射 */
function loadPinyinMap() {
    return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', PINYIN_CSV_PATH, true);
        xhr.onload = function() {
            if (xhr.status === 200 || xhr.status === 0) {
                try {
                    const map = {};
                    const lines = xhr.responseText.split('\n');
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed) continue;
                        const commaIdx = trimmed.indexOf(',');
                        if (commaIdx === -1) continue;
                        const initial = trimmed.substring(0, commaIdx).trim();
                        const chars = trimmed.substring(commaIdx + 1).trim();
                        if (initial && chars) {
                            for (const ch of chars) {
                                map[ch] = initial;
                            }
                        }
                    }
                    PINYIN_INITIAL_MAP = map;
                    pinyinMapLoaded = true;
                } catch (e) {
                    PINYIN_INITIAL_MAP = {};
                }
            } else {
                PINYIN_INITIAL_MAP = {};
            }
            resolve();
        };
        xhr.onerror = function() {
            PINYIN_INITIAL_MAP = {};
            resolve();
        };
        xhr.send();
    });
}

/* 获取汉字拼音首字母 */
function getPinyinInitial(char) {
    return PINYIN_INITIAL_MAP[char] || '';
}

/* 获取字符串的拼音首字母序列 */
function getPinyinInitials(str) {
    let result = '';
    for (const ch of str) {
        const initial = getPinyinInitial(ch);
        if (initial) {
            result += initial;
        }
    }
    return result;
}

/* 从 localStorage 加载分类快速输入数据 */
function loadQuickCategoryGroups() {
    try {
        const saved = localStorage.getItem(CATEGORY_STORAGE_KEY);
        if (saved) {
            quickCategoryGroups = JSON.parse(saved);
        } else {
            const defaults = typeof loadDefaultQuickInputFromCSV === 'function' ? loadDefaultQuickInputFromCSV() : null;
            if (defaults && defaults.quickCategoryGroups) {
                quickCategoryGroups = defaults.quickCategoryGroups.map(g => {
                    if (!g.id) g.id = generateCategoryId();
                    return g;
                });
                saveQuickCategoryGroups();
            } else {
                quickCategoryGroups = [];
            }
        }
    } catch (e) {
        quickCategoryGroups = [];
    }
}

/* 保存分类快速输入数据到 localStorage */
function saveQuickCategoryGroups() {
    try {
        localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(quickCategoryGroups));
    } catch (e) {}
}

/* 生成唯一ID */
function generateCategoryId() {
    return 'cat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

/* 打开分类快速输入管理弹窗 */
function openQuickCategoryModal() {
    const modalTitle = document.getElementById('dynamicModalTitle');
    const modalBody = document.getElementById('dynamicModalBody');
    const modalFooter = document.getElementById('dynamicModalFooter');

    modalTitle.textContent = '分类快速输入';

    renderCategoryModal(modalBody);

    modalFooter.innerHTML = `
        <button class="modal-btn" onclick="importQuickInputFromCSV()">导入CSV</button>
        <button class="modal-btn" onclick="exportQuickInputToCSV()">导出CSV</button>
        <button class="modal-btn modal-btn-danger" onclick="clearCategoryQuickInput()">🗑️ 清空</button>
        <button class="modal-btn modal-btn-secondary" onclick="closeModal('dynamicModal')">关闭</button>
    `;

    showModal('dynamicModal');
}

/* 渲染分类管理界面 */
function renderCategoryModal(container) {
    let html = `
        <div class="category-quick-input-container">
            <div class="cq-description" style="margin-bottom:12px;color:#666;font-size:13px;">
                设置分类分组，每个分组定义一个触发前缀。在编辑器中输入前缀字母即可弹出该分组的词条列表。
            </div>
            <div class="cq-groups-list" id="cqGroupsList">
    `;

    quickCategoryGroups.forEach((group, index) => {
        html += `
            <div class="cq-group-card" data-group-index="${index}">
                <div class="cq-group-header" onclick="toggleCategoryGroupItems(${index})">
                    <span class="cq-group-toggle" id="cqToggle_${index}">▶</span>
                    <span class="cq-group-prefix-badge">${escapeHtml(group.prefix)}</span>
                    <span class="cq-group-name">${escapeHtml(group.name)}</span>
                    <span class="cq-group-count">${group.items.length} 项</span>
                    <span class="cq-group-actions">
                        <button class="cq-btn cq-btn-sm" onclick="event.stopPropagation();editCategoryGroup(${index})" title="编辑分组">✏️</button>
                        <button class="cq-btn cq-btn-sm cq-btn-danger" onclick="event.stopPropagation();deleteCategoryGroup(${index})" title="删除分组">🗑️</button>
                    </span>
                </div>
                <div class="cq-group-body" id="cqBody_${index}" style="display:none;">
                    <div class="cq-items-container">
                        <div class="cq-items-header">
                            <span>词条列表</span>
                            <button class="cq-btn cq-btn-sm cq-btn-primary" onclick="addCategoryItem(${index})">+ 添加</button>
                        </div>
                        <div class="cq-items-list" id="cqItemsList_${index}">
        `;
        if (group.items.length === 0) {
            html += '<div class="cq-empty-hint">暂未添加词条</div>';
        } else {
            group.items.forEach((item, itemIndex) => {
                html += `
                    <div class="cq-item-row">
                        <span class="cq-item-text">${escapeHtml(item)}</span>
                        <button class="cq-btn cq-btn-sm cq-btn-danger" onclick="removeCategoryItem(${index}, ${itemIndex})" title="删除">✕</button>
                    </div>
                `;
            });
        }
        html += `
                        </div>
                        <div class="cq-batch-add">
                            <textarea id="cqBatchInput_${index}" class="cq-batch-textarea" placeholder="每行输入一个词条，批量添加..."></textarea>
                            <button class="cq-btn cq-btn-primary" onclick="batchAddCategoryItems(${index})">批量添加</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    html += `
            </div>
            <div class="cq-actions-bar">
                <button class="cq-btn cq-btn-primary" onclick="addCategoryGroup()">+ 新建分组</button>
            </div>
        </div>
    `;

    container.innerHTML = html;
}

/* 切换分组展开/折叠 */
function toggleCategoryGroupItems(index) {
    const body = document.getElementById('cqBody_' + index);
    const toggle = document.getElementById('cqToggle_' + index);
    if (body) {
        const isVisible = body.style.display !== 'none';
        body.style.display = isVisible ? 'none' : 'block';
        if (toggle) {
            toggle.textContent = isVisible ? '▶' : '▼';
        }
    }
}

/* 添加新分组 */
function addCategoryGroup() {
    const modalTitle = document.getElementById('dynamicModalTitle');
    const modalBody = document.getElementById('dynamicModalBody');
    const modalFooter = document.getElementById('dynamicModalFooter');

    modalTitle.textContent = '新建分组';

    modalBody.innerHTML = `
        <div class="form-group">
            <label>分组名称</label>
            <input type="text" id="newGroupName" class="cq-input" placeholder="如：人物、地名、招式" maxlength="20">
        </div>
        <div class="form-group">
            <label>触发前缀（单个大写字母）</label>
            <input type="text" id="newGroupPrefix" class="cq-input" placeholder="如：R、D、Z、W" maxlength="1" style="width:80px;text-align:center;font-weight:bold;text-transform:uppercase;">
            <div style="font-size:12px;color:#888;margin-top:4px;">输入该字母时将弹出此分组的所有词条</div>
        </div>
    `;

    modalFooter.innerHTML = `
        <button class="modal-btn modal-btn-secondary" onclick="cancelCategoryEdit()">取消</button>
        <button class="modal-btn modal-btn-primary" onclick="confirmAddGroup()">确定</button>
    `;
}

/* 确认添加分组 */
function confirmAddGroup() {
    const nameInput = document.getElementById('newGroupName');
    const prefixInput = document.getElementById('newGroupPrefix');
    if (!nameInput || !prefixInput) return;

    const name = nameInput.value.trim();
    const prefix = prefixInput.value.trim().toUpperCase();

    if (!name) {
        showError('请输入分组名称');
        return;
    }
    const RESERVED = ['系统设置', '普通列表'];
    if (RESERVED.includes(name)) {
        showError('"' + name + '" 为系统保留名称，不能用作分组名');
        return;
    }
    if (!prefix || !/^[A-Z]$/.test(prefix)) {
        showError('请输入单个大写字母作为触发前缀');
        return;
    }

    const existing = quickCategoryGroups.find(g => g.prefix === prefix);
    if (existing) {
        showError('前缀 "' + prefix + '" 已被分组 "' + existing.name + '" 使用，请换一个');
        return;
    }

    quickCategoryGroups.push({
        id: generateCategoryId(),
        name: name,
        prefix: prefix,
        items: []
    });
    saveQuickCategoryGroups();

    const modalBody = document.getElementById('dynamicModalBody');
    renderCategoryModal(modalBody);
    showSuccess('分组 "' + name + '" 创建成功');
}

/* 编辑分组 */
function editCategoryGroup(index) {
    const group = quickCategoryGroups[index];
    if (!group) return;

    const modalTitle = document.getElementById('dynamicModalTitle');
    const modalBody = document.getElementById('dynamicModalBody');
    const modalFooter = document.getElementById('dynamicModalFooter');

    modalTitle.textContent = '编辑分组';

    modalBody.innerHTML = `
        <div class="form-group">
            <label>分组名称</label>
            <input type="text" id="editGroupName" class="cq-input" value="${escapeHtml(group.name)}" maxlength="20">
        </div>
        <div class="form-group">
            <label>触发前缀（单个大写字母）</label>
            <input type="text" id="editGroupPrefix" class="cq-input" value="${group.prefix}" maxlength="1" style="width:80px;text-align:center;font-weight:bold;text-transform:uppercase;">
            <div style="font-size:12px;color:#888;margin-top:4px;">输入该字母时将弹出此分组的所有词条</div>
        </div>
    `;

    modalFooter.innerHTML = `
        <button class="modal-btn modal-btn-secondary" onclick="cancelCategoryEdit()">取消</button>
        <button class="modal-btn modal-btn-primary" onclick="confirmEditGroup(${index})">保存</button>
    `;
}

/* 确认编辑分组 */
function confirmEditGroup(index) {
    const group = quickCategoryGroups[index];
    if (!group) return;

    const nameInput = document.getElementById('editGroupName');
    const prefixInput = document.getElementById('editGroupPrefix');
    if (!nameInput || !prefixInput) return;

    const name = nameInput.value.trim();
    const prefix = prefixInput.value.trim().toUpperCase();

    if (!name) {
        showError('请输入分组名称');
        return;
    }
    const RESERVED = ['系统设置', '普通列表', '普通', '常用'];
    if (RESERVED.includes(name)) {
        showError('"' + name + '" 为系统保留名称，不能用作分组名');
        return;
    }
    if (!prefix || !/^[A-Z]$/.test(prefix)) {
        showError('请输入单个大写字母作为触发前缀');
        return;
    }

    const existing = quickCategoryGroups.find((g, i) => i !== index && g.prefix === prefix);
    if (existing) {
        showError('前缀 "' + prefix + '" 已被分组 "' + existing.name + '" 使用，请换一个');
        return;
    }

    group.name = name;
    group.prefix = prefix;
    saveQuickCategoryGroups();

    const modalBody = document.getElementById('dynamicModalBody');
    renderCategoryModal(modalBody);
    showSuccess('分组已更新');
}

/* 删除分组 */
function deleteCategoryGroup(index) {
    const group = quickCategoryGroups[index];
    if (!group) return;

    if (!confirm('确定要删除分组 "' + group.name + '" 吗？')) return;

    quickCategoryGroups.splice(index, 1);
    saveQuickCategoryGroups();

    const modalBody = document.getElementById('dynamicModalBody');
    renderCategoryModal(modalBody);
}

/* 为分组添加单个词条 */
function addCategoryItem(groupIndex) {
    const group = quickCategoryGroups[groupIndex];
    if (!group) return;

    const itemsList = document.getElementById('cqItemsList_' + groupIndex);
    if (!itemsList) return;

    const tempInput = document.createElement('div');
    tempInput.className = 'cq-item-row cq-item-adding';
    tempInput.innerHTML = `
        <input type="text" class="cq-item-input" placeholder="输入词条内容..." id="cqNewItemInput_${groupIndex}" maxlength="100">
        <button class="cq-btn cq-btn-sm cq-btn-primary" onclick="confirmAddCategoryItem(${groupIndex})">✓</button>
        <button class="cq-btn cq-btn-sm" onclick="cancelAddCategoryItem(${groupIndex})">✕</button>
    `;
    itemsList.appendChild(tempInput);

    const input = document.getElementById('cqNewItemInput_' + groupIndex);
    if (input) {
        setTimeout(() => input.focus(), 50);
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                confirmAddCategoryItem(groupIndex);
            } else if (e.key === 'Escape') {
                cancelAddCategoryItem(groupIndex);
            }
        });
    }
}

/* 确认添加单个词条 */
function confirmAddCategoryItem(groupIndex) {
    const input = document.getElementById('cqNewItemInput_' + groupIndex);
    if (!input) return;

    const text = input.value.trim();
    if (!text) {
        showError('请输入词条内容');
        return;
    }

    const group = quickCategoryGroups[groupIndex];
    if (!group) return;

    group.items.push(text);
    saveQuickCategoryGroups();

    const modalBody = document.getElementById('dynamicModalBody');
    renderCategoryModal(modalBody);

    const body = document.getElementById('cqBody_' + groupIndex);
    if (body) body.style.display = 'block';
    const toggle = document.getElementById('cqToggle_' + groupIndex);
    if (toggle) toggle.textContent = '▼';
}

/* 取消添加单个词条 */
function cancelAddCategoryItem(groupIndex) {
    const input = document.getElementById('cqNewItemInput_' + groupIndex);
    if (input) {
        const row = input.closest('.cq-item-adding');
        if (row) row.remove();
    }
}

/* 批量添加词条 */
function batchAddCategoryItems(groupIndex) {
    const textarea = document.getElementById('cqBatchInput_' + groupIndex);
    if (!textarea) return;

    const lines = textarea.value.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length === 0) {
        showError('请至少输入一个词条');
        return;
    }

    const group = quickCategoryGroups[groupIndex];
    if (!group) return;

    group.items.push(...lines);
    saveQuickCategoryGroups();

    const modalBody = document.getElementById('dynamicModalBody');
    renderCategoryModal(modalBody);

    const body = document.getElementById('cqBody_' + groupIndex);
    if (body) body.style.display = 'block';
    const toggle = document.getElementById('cqToggle_' + groupIndex);
    if (toggle) toggle.textContent = '▼';
}

/* 删除词条 */
function removeCategoryItem(groupIndex, itemIndex) {
    const group = quickCategoryGroups[groupIndex];
    if (!group) return;

    group.items.splice(itemIndex, 1);
    saveQuickCategoryGroups();

    const modalBody = document.getElementById('dynamicModalBody');
    renderCategoryModal(modalBody);

    const body = document.getElementById('cqBody_' + groupIndex);
    if (body) body.style.display = 'block';
    const toggle = document.getElementById('cqToggle_' + groupIndex);
    if (toggle) toggle.textContent = '▼';
}

/* 取消编辑，回到列表视图 */
function cancelCategoryEdit() {
    const modalBody = document.getElementById('dynamicModalBody');
    renderCategoryModal(modalBody);
}

/* 清空分类快速输入配置 */
function clearCategoryQuickInput() {
    if (!confirm('确定要清空所有分类快速输入数据吗？')) return;
    quickCategoryGroups = [];
    saveQuickCategoryGroups();
    const content = document.getElementById('qiCategoryContent') || document.getElementById('dynamicModalBody');
    renderCategoryModal(content);
    showSuccess('已清空');
}

/* === CodeMirror Hint 集成 === */

function quickCategoryHint(cm) {
    if (!quickCategoryGroups || quickCategoryGroups.length === 0) return;

    const cur = cm.getCursor();
    const line = cm.getLine(cur.line);
    const linePart = line.substring(0, cur.ch);

    if (!linePart || linePart.length === 0) return;

    const lastChar = linePart[linePart.length - 1];

    const matchedGroup = quickCategoryGroups.find(g => g.prefix === lastChar);
    if (!matchedGroup || matchedGroup.items.length === 0) return;

    const isIsolated = linePart.length === 1 ||
        /[\s,;。，；、\(\)\[\]\{\}]/.test(linePart[linePart.length - 2]);

    if (!isIsolated) return;

    const from = CodeMirror.Pos(cur.line, linePart.length - 1);

    const list = matchedGroup.items.map(text => ({
        text: text,
        displayText: text,
        from: from,
        to: cur
    }));

    list.sort((a, b) => a.text.localeCompare(b.text, 'zh-CN'));

    return {
        list: list,
        from: from,
        to: cur
    };
}

/* 带筛选的快速分类提示（在输入前缀后继续输入字符时触发） */
function quickCategoryFilterHint(cm) {
    if (!quickCategoryGroups || quickCategoryGroups.length === 0) return;

    const cur = cm.getCursor();
    const line = cm.getLine(cur.line);
    const linePart = line.substring(0, cur.ch);

    if (!linePart || linePart.length < 1) return;

    const prefixMatch = linePart.match(/^([A-Z])([a-zA-Z0-9]*)$/);
    if (!prefixMatch) return;

    const prefix = prefixMatch[1];
    const filterText = prefixMatch[2];

    const matchedGroup = quickCategoryGroups.find(g => g.prefix === prefix);
    if (!matchedGroup || matchedGroup.items.length === 0) return;

    const isIsolated = linePart.length === 1 ||
        (linePart.length > 1 && /[\s,;。，；、\(\)\[\]\{\}]/.test(line[linePart.length - prefixMatch[0].length - 1] || ''));

    if (!isIsolated && linePart.length > 1) {
        const beforePrefix = line[linePart.length - prefixMatch[0].length - 1] || '';
        if (beforePrefix && !/[\s,;。，；、\(\)\[\]\{\}]/.test(beforePrefix)) return;
    }

    let filtered = matchedGroup.items;

    if (filterText.length > 0) {
        const lowerFilter = filterText.toLowerCase();

        filtered = filtered.filter(item => {
            if (item.toLowerCase().startsWith(lowerFilter)) return true;

            if (/^[a-zA-Z]+$/.test(filterText)) {
                const initials = getPinyinInitials(item);
                if (initials.startsWith(lowerFilter)) return true;
            }

            return false;
        });
    }

    if (filtered.length === 0) return;

    const from = CodeMirror.Pos(cur.line, linePart.length - prefixMatch[0].length);

    const list = filtered.map(text => ({
        text: text,
        displayText: text,
        from: from,
        to: cur
    }));

    list.sort((a, b) => a.text.localeCompare(b.text, 'zh-CN'));

    const categoryInfo = { prefix: prefix, groupName: matchedGroup.name };
    const separatorHint = {
        text: '__category_header__',
        displayText: '▼ ' + matchedGroup.name + ' (' + prefix + ') — 共 ' + filtered.length + ' 项',
        className: 'CodeMirror-hint-category-header'
    };
    list.unshift(separatorHint);

    return {
        list: list,
        from: from,
        to: cur
    };
}

/* 分类快速输入提示：统一入口 */
function unifiedCategoryHint(cm) {
    if (!quickCategoryGroups || quickCategoryGroups.length === 0) return null;

    const cur = cm.getCursor();
    const line = cm.getLine(cur.line);
    const linePart = line.substring(0, cur.ch);

    if (!linePart || linePart.length < 1) return null;

    /* 从光标往前找大写前缀字母 + 可选连续字母/数字作为筛选词
       不限制前面必须是空格/行首，在任何位置输入前缀都触发 */
    const match = linePart.match(/([A-Z])([a-zA-Z0-9]*)$/);
    if (!match) return null;

    const prefix = match[1];
    const filterText = match[2];

    const matchedGroup = quickCategoryGroups.find(g => g.prefix === prefix);
    if (!matchedGroup || matchedGroup.items.length === 0) return null;

    let filtered = matchedGroup.items;

    if (filterText.length > 0) {
        const lowerFilter = filterText.toLowerCase();

        filtered = filtered.filter(item => {
            if (item.toLowerCase().startsWith(lowerFilter)) return true;
            if (/^[a-zA-Z]+$/.test(filterText)) {
                const initials = getPinyinInitials(item);
                if (filterText.length === 1) {
                    if (initials.includes(lowerFilter)) return true;
                } else {
                    if (initials.startsWith(lowerFilter)) return true;
                }
            }
            return false;
        });
    }

    if (filtered.length === 0) return null;

    const from = CodeMirror.Pos(cur.line, match.index);

    const list = filtered.map(text => ({
        text: text,
        displayText: text,
        from: from,
        to: cur
    }));

    list.sort((a, b) => a.text.localeCompare(b.text, 'zh-CN'));

    const headerText = filterText.length > 0
        ? '▼ ' + matchedGroup.name + ' (' + prefix + ') — 筛选结果 ' + filtered.length + '/' + matchedGroup.items.length + ' 项'
        : '▼ ' + matchedGroup.name + ' (' + prefix + ') — 共 ' + filtered.length + ' 项';

    const separatorHint = {
        text: '__category_header__',
        displayText: headerText,
        className: 'CodeMirror-hint-category-header'
    };
    list.unshift(separatorHint);

    return {
        list: list,
        from: from,
        to: cur
    };
}

/* 在编辑器中手动触发分类提示 */
function triggerCategoryHint() {
    if (!editor || quickCategoryGroups.length === 0) return;
    clearTimeout(categoryHintTimer);
    categoryHintTimer = setTimeout(() => {
        const data = unifiedCategoryHint(editor);
        if (data) {
            editor.showHint({
                hint: function() { return data; },
                completeSingle: false
            });
        }
    }, 30);
}

/* 初始化分类快速输入系统 */
async function initQuickCategoryInput() {
    await loadPinyinMap();
    loadQuickCategoryGroups();
}

/* 扩展快速输入弹窗，添加分类快速输入标签页 */
function extendQuickInputModal() {
    const originalOpen = window.openQuickInputModal;
    if (typeof originalOpen !== 'function') return;

    window.openQuickInputModal = function() {
        const modalTitle = document.getElementById('dynamicModalTitle');
        const modalBody = document.getElementById('dynamicModalBody');
        const modalFooter = document.getElementById('dynamicModalFooter');

        modalTitle.textContent = '快速输入列表';

        modalBody.innerHTML = `
            <div class="quick-input-tabs" style="display:flex;gap:0;margin-bottom:12px;border-bottom:2px solid #6a1b9a;">
                <button class="qi-tab qi-tab-active" data-tab="plain" onclick="switchQuickInputTab('plain')">普通列表</button>
                <button class="qi-tab" data-tab="category" onclick="switchQuickInputTab('category')">分类快速输入</button>
            </div>
            <div id="qiPlainTab">
                <div class="modal-description" style="margin-bottom:12px;color:#666;font-size:13px;">
                    每行输入一个词条，保存后在编辑器中输入其第一个字符时会触发自动补全。
                </div>
                <textarea id="quickInputTextarea" style="width:100%;height:250px;padding:10px;border:1px solid #ddd;border-radius:4px;font-size:14px;resize:vertical;box-sizing:border-box;" placeholder="例如：&#10;张三&#10;李四&#10;王五&#10;魔法学院">${escapeHtml(quickInputItems ? quickInputItems.join('\n') : '')}</textarea>
            </div>
            <div id="qiCategoryTab" style="display:none;">
                <div id="qiCategoryContent"></div>
            </div>
        `;

        modalFooter.innerHTML = `
            <button class="modal-btn" onclick="closeModal('dynamicModal')">取消</button>
            <button class="modal-btn modal-btn-primary" onclick="saveQuickInputList()">保存普通列表</button>
        `;

        renderCategoryModal(document.getElementById('qiCategoryContent'));

        showModal('dynamicModal');
    };
}

/* 切换快速输入弹窗的标签页 */
function switchQuickInputTab(tabName) {
    const tabs = document.querySelectorAll('.qi-tab');
    tabs.forEach(t => {
        t.classList.remove('qi-tab-active');
        if (t.dataset.tab === tabName) {
            t.classList.add('qi-tab-active');
        }
    });

    document.getElementById('qiPlainTab').style.display = tabName === 'plain' ? 'block' : 'none';
    document.getElementById('qiCategoryTab').style.display = tabName === 'category' ? 'block' : 'none';
}

/* 增强版快速输入弹窗（替代原版） */
function openQuickInputModal() {
    const modalTitle = document.getElementById('dynamicModalTitle');
    const modalBody = document.getElementById('dynamicModalBody');
    const modalFooter = document.getElementById('dynamicModalFooter');

    modalTitle.textContent = '快速输入列表';

    modalBody.innerHTML = `
        <div class="quick-input-tabs" style="display:flex;gap:0;margin-bottom:12px;border-bottom:2px solid #6a1b9a;">
            <button class="qi-tab qi-tab-active" data-tab="plain" onclick="switchQuickInputTab('plain')">普通列表</button>
            <button class="qi-tab" data-tab="category" onclick="switchQuickInputTab('category')">分类快速输入</button>
        </div>
        <div id="qiPlainTab">
            <div class="modal-description" style="margin-bottom:12px;color:#666;font-size:13px;">
                每行输入一个词条，保存后在编辑器中输入其第一个字符时会触发自动补全。
            </div>
            <textarea id="quickInputTextarea" style="width:100%;height:250px;padding:10px;border:1px solid #ddd;border-radius:4px;font-size:14px;resize:vertical;box-sizing:border-box;" placeholder="例如：&#10;张三&#10;李四&#10;王五&#10;魔法学院">${escapeHtml(quickInputItems ? quickInputItems.join('\n') : '')}</textarea>
        </div>
        <div id="qiCategoryTab" style="display:none;">
            <div id="qiCategoryContent"></div>
        </div>
    `;

    modalFooter.innerHTML = `
        <button class="modal-btn" onclick="importQuickInputFromCSV()">📥 CSV</button>
        <button class="modal-btn" onclick="exportQuickInputToCSV()">📤 CSV</button>
        <button class="modal-btn modal-btn-danger" onclick="clearQuickInputList()">🗑️ 清空</button>
        <button class="modal-btn" onclick="closeModal('dynamicModal')">取消</button>
        <button class="modal-btn modal-btn-primary" onclick="saveQuickInputList()">保存普通列表</button>
    `;

    renderCategoryModal(document.getElementById('qiCategoryContent'));

    showModal('dynamicModal');
}

document.addEventListener('DOMContentLoaded', function() {
    initQuickCategoryInput();
});
