/* --- info.json 可视化编辑模块 ---
 *   infoJsonData 数据缓存与面板管理
 *   loadInfoJson, initEmptyInfoJson 数据加载与初始化
 *   saveInfoJsonToStorage, loadInfoJsonFromStorage 本地存储
 *   exportInfoJson, importInfoJson 导入导出
 *   validateInfoJson 数据校验
 *   renderInfoJsonPanel 侧边栏面板渲染
 *   openInfoEditModal, openInfoAddModal 编辑/新增模态框
 *   submitInfoEditModal 表单提交
 *   addVersionRow, removeVersionRow 版本行管理
 *   getInfoClueIds, getInfoProfileIds 等工具联动函数
 *   依赖: utils.js (escapeHtml, showSuccess, showError, showModal, closeModal 等) */

/* ========== 全局变量 ========== */
let infoJsonData = null;       // info.json 数据缓存
let infoJsonPanelActive = false; // 面板是否激活

/* 当前编辑模态框的 section 和 itemId，用于 submitInfoEditModal 识别上下文 */
let _infoEditSection = null;
let _infoEditItemId = null;

/* ========== 数据加载与管理 ========== */

/* 从 info.json 文件 fetch 加载数据到 infoJsonData，失败则初始化空结构 */
async function loadInfoJson() {
    try {
        const response = await fetch('info.json?' + Date.now());
        if (response.ok) {
            infoJsonData = await response.json();
            /* 确保数据结构完整 */
            if (!infoJsonData.$schemaVersion) {
                infoJsonData.$schemaVersion = '2.2';
            }
            if (!infoJsonData.Characters) infoJsonData.Characters = [];
            if (!infoJsonData.Clues) infoJsonData.Clues = [];
            if (!infoJsonData.Profiles) infoJsonData.Profiles = [];
            if (!infoJsonData.Rules) infoJsonData.Rules = [];
            if (!infoJsonData.Notes) infoJsonData.Notes = [];
            if (!infoJsonData.ChapterNames) infoJsonData.ChapterNames = {};
            saveInfoJsonToStorage();
            showSuccess('info.json 加载成功');
        } else {
            /* 文件不存在或加载失败，尝试从 localStorage 恢复 */
            const restored = loadInfoJsonFromStorage();
            if (restored) {
                infoJsonData = restored;
                showSuccess('已从本地缓存恢复 info.json');
            } else {
                infoJsonData = initEmptyInfoJson();
                showSuccess('已初始化空 info.json 结构');
            }
        }
    } catch (e) {
        const restored = loadInfoJsonFromStorage();
        if (restored) {
            infoJsonData = restored;
            showSuccess('已从本地缓存恢复 info.json');
        } else {
            infoJsonData = initEmptyInfoJson();
            showError('info.json 加载失败，已初始化空结构');
        }
    }
    if (infoJsonPanelActive) {
        renderInfoJsonPanel();
    }
}

/* 返回一个符合 schemaVersion 2.2 的空数据结构 */
function initEmptyInfoJson() {
    return {
        "Name": { "zh-Hans": "" },
        "Description": { "zh-Hans": "" },
        "Author": { "zh-Hans": "" },
        "Enter": "",
        "Version": "1.0.0",
        "Characters": [],
        "Clues": [],
        "Profiles": [],
        "Rules": [],
        "Notes": [],
        "ChapterNames": {},
        "$schemaVersion": "2.2"
    };
}

/* 将 infoJsonData 保存到 localStorage */
function saveInfoJsonToStorage() {
    try {
        localStorage.setItem('infoJsonData', JSON.stringify(infoJsonData));
    } catch (e) {
        console.error('保存 infoJsonData 到 localStorage 失败:', e);
    }
}

/* 从 localStorage 恢复数据，失败返回 null */
function loadInfoJsonFromStorage() {
    try {
        const saved = localStorage.getItem('infoJsonData');
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (e) {
        console.error('从 localStorage 读取 infoJsonData 失败:', e);
    }
    return null;
}

/* 将 infoJsonData 序列化为格式化 JSON 并触发文件下载 */
function exportInfoJson() {
    if (!infoJsonData) {
        showError('没有可导出的数据');
        return;
    }
    const jsonStr = JSON.stringify(infoJsonData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'info.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showSuccess('info.json 已导出');
}

/* 触发文件选择器，读取用户选择的 JSON 文件并加载 */
function importInfoJson() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = function (e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (event) {
            try {
                const data = JSON.parse(event.target.result);
                /* 基本结构校验 */
                if (typeof data !== 'object' || data === null) {
                    showError('JSON 格式无效：根元素不是对象');
                    return;
                }
                /* 补全缺失字段 */
                if (!data.Characters) data.Characters = [];
                if (!data.Clues) data.Clues = [];
                if (!data.Profiles) data.Profiles = [];
                if (!data.Rules) data.Rules = [];
                if (!data.Notes) data.Notes = [];
                if (!data.ChapterNames) data.ChapterNames = {};
                if (!data.$schemaVersion) data.$schemaVersion = '2.2';

                infoJsonData = data;
                saveInfoJsonToStorage();
                renderInfoJsonPanel();
                showSuccess('info.json 导入成功');
            } catch (err) {
                showError('JSON 解析失败：' + err.message);
            }
        };
        reader.readAsText(file, 'UTF-8');
    };
    input.click();
}

/* 校验数据完整性，返回 { errors: [], warnings: [] } */
function validateInfoJson() {
    const result = { errors: [], warnings: [] };

    if (!infoJsonData) {
        result.errors.push('数据为空，未加载任何 info.json');
        return result;
    }

    /* 基础字段检查 */
    const basicFields = ['Name', 'Description', 'Author', 'Enter', 'Version'];
    basicFields.forEach(field => {
        if (!infoJsonData[field]) {
            result.warnings.push(`基础字段 "${field}" 缺失`);
        } else if (typeof infoJsonData[field] === 'object' && !infoJsonData[field]['zh-Hans']) {
            result.warnings.push(`基础字段 "${field}" 缺少 zh-Hans 语言版本`);
        }
    });

    /* schemaVersion 检查 */
    if (infoJsonData.$schemaVersion !== '2.2') {
        result.warnings.push(`schemaVersion 为 "${infoJsonData.$schemaVersion}"，当前推荐 "2.2"`);
    }

    /* Characters 检查 */
    if (infoJsonData.Characters && Array.isArray(infoJsonData.Characters)) {
        infoJsonData.Characters.forEach((char, idx) => {
            if (!char.Id) result.errors.push(`角色 #${idx + 1} 缺少 Id`);
            if (!char.Name || !char.Name['zh-Hans']) result.warnings.push(`角色 "${char.Id || '#' + (idx + 1)}" 缺少中文名称`);
            if (!char.Color) result.warnings.push(`角色 "${char.Id || '#' + (idx + 1)}" 缺少颜色`);
        });
        /* 检查 Id 重复 */
        const charIds = infoJsonData.Characters.map(c => c.Id).filter(Boolean);
        const dupCharIds = charIds.filter((id, i) => charIds.indexOf(id) !== i);
        dupCharIds.forEach(id => result.errors.push(`角色 Id "${id}" 重复`));
    }

    /* Clues 检查 */
    if (infoJsonData.Clues && Array.isArray(infoJsonData.Clues)) {
        infoJsonData.Clues.forEach((clue, idx) => {
            if (!clue.Id) result.errors.push(`证物 #${idx + 1} 缺少 Id`);
            if (!clue.Items || clue.Items.length === 0) {
                result.warnings.push(`证物 "${clue.Id || '#' + (idx + 1)}" 没有版本条目`);
            } else {
                clue.Items.forEach((item, vIdx) => {
                    if (!item.Version && item.Version !== 0) result.errors.push(`证物 "${clue.Id}" 版本 #${vIdx + 1} 缺少 Version`);
                    if (!item.Name || !item.Name['zh-Hans']) result.warnings.push(`证物 "${clue.Id}" 版本 #${vIdx + 1} 缺少中文名称`);
                });
            }
        });
        const clueIds = infoJsonData.Clues.map(c => c.Id).filter(Boolean);
        const dupClueIds = clueIds.filter((id, i) => clueIds.indexOf(id) !== i);
        dupClueIds.forEach(id => result.errors.push(`证物 Id "${id}" 重复`));
    }

    /* Profiles 检查 */
    if (infoJsonData.Profiles && Array.isArray(infoJsonData.Profiles)) {
        infoJsonData.Profiles.forEach((prof, idx) => {
            if (!prof.Id) result.errors.push(`人物档案 #${idx + 1} 缺少 Id`);
            if (!prof.Items || prof.Items.length === 0) {
                result.warnings.push(`人物档案 "${prof.Id || '#' + (idx + 1)}" 没有版本条目`);
            }
        });
        const profIds = infoJsonData.Profiles.map(p => p.Id).filter(Boolean);
        const dupProfIds = profIds.filter((id, i) => profIds.indexOf(id) !== i);
        dupProfIds.forEach(id => result.errors.push(`人物档案 Id "${id}" 重复`));
    }

    /* Rules 检查 */
    if (infoJsonData.Rules && Array.isArray(infoJsonData.Rules)) {
        infoJsonData.Rules.forEach((rule, idx) => {
            if (!rule.Id) result.errors.push(`规则 #${idx + 1} 缺少 Id`);
            if (!rule.Items || rule.Items.length === 0) {
                result.warnings.push(`规则 "${rule.Id || '#' + (idx + 1)}" 没有版本条目`);
            }
        });
        const ruleIds = infoJsonData.Rules.map(r => r.Id).filter(Boolean);
        const dupRuleIds = ruleIds.filter((id, i) => ruleIds.indexOf(id) !== i);
        dupRuleIds.forEach(id => result.errors.push(`规则 Id "${id}" 重复`));
    }

    /* Notes 检查 */
    if (infoJsonData.Notes && Array.isArray(infoJsonData.Notes)) {
        infoJsonData.Notes.forEach((note, idx) => {
            if (!note.Id) result.errors.push(`笔记 #${idx + 1} 缺少 Id`);
            if (!note.Items || note.Items.length === 0) {
                result.warnings.push(`笔记 "${note.Id || '#' + (idx + 1)}" 没有版本条目`);
            }
        });
        const noteIds = infoJsonData.Notes.map(n => n.Id).filter(Boolean);
        const dupNoteIds = noteIds.filter((id, i) => noteIds.indexOf(id) !== i);
        dupNoteIds.forEach(id => result.errors.push(`笔记 Id "${id}" 重复`));
    }

    /* ChapterNames 检查 */
    if (infoJsonData.ChapterNames && typeof infoJsonData.ChapterNames === 'object') {
        const keys = Object.keys(infoJsonData.ChapterNames);
        if (keys.length === 0) {
            result.warnings.push('ChapterNames 为空');
        }
        keys.forEach(key => {
            const val = infoJsonData.ChapterNames[key];
            if (!val || (typeof val === 'object' && !val['zh-Hans'])) {
                result.warnings.push(`章节名 "${key}" 缺少 zh-Hans 语言版本`);
            }
        });
    }

    return result;
}

/* 显示校验结果模态框 */
function showValidateResult() {
    const result = validateInfoJson();
    const modalTitle = document.getElementById('dynamicModalTitle');
    const modalBody = document.getElementById('dynamicModalBody');
    const modalFooter = document.getElementById('dynamicModalFooter');

    modalTitle.textContent = 'info.json 校验结果';

    if (result.errors.length === 0 && result.warnings.length === 0) {
        modalBody.innerHTML = `
            <div style="text-align:center;padding:40px 20px;">
                <div style="font-size:48px;margin-bottom:16px;">✅</div>
                <div style="font-size:18px;font-weight:600;color:#2e7d32;margin-bottom:8px;">校验通过</div>
                <div style="color:#888;font-size:14px;">未发现错误或警告，数据结构完整。</div>
            </div>
        `;
    } else {
        let html = '<div style="display:flex;gap:12px;margin-bottom:16px;">';
        if (result.errors.length > 0) {
            html += `<div style="flex:1;text-align:center;padding:10px;background:#ffebee;border-radius:8px;">
                <div style="font-size:24px;font-weight:700;color:#c62828;">${result.errors.length}</div>
                <div style="font-size:12px;color:#c62828;font-weight:500;">错误</div>
            </div>`;
        }
        if (result.warnings.length > 0) {
            html += `<div style="flex:1;text-align:center;padding:10px;background:#fff3e0;border-radius:8px;">
                <div style="font-size:24px;font-weight:700;color:#e65100;">${result.warnings.length}</div>
                <div style="font-size:12px;color:#e65100;font-weight:500;">警告</div>
            </div>`;
        }
        html += '</div>';

        const all = [...result.errors.map(e => ({ type: 'error', msg: e })),
        ...result.warnings.map(w => ({ type: 'warning', msg: w }))];
        html += '<div style="max-height:400px;overflow-y:auto;">';
        all.forEach(item => {
            const bg = item.type === 'error' ? '#ffebee' : '#fff3e0';
            const badgeBg = item.type === 'error' ? '#c62828' : '#e65100';
            const icon = item.type === 'error' ? '❌' : '⚠️';
            html += `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:${bg};border-radius:8px;margin-bottom:6px;font-size:13px;">`;
            html += `<span style="flex-shrink:0;margin-top:1px;">${icon}</span>`;
            html += `<span style="color:#333;flex:1;line-height:1.6;">${escapeHtml(item.msg)}</span>`;
            html += `<span style="flex-shrink:0;font-size:11px;background:${badgeBg};color:white;padding:1px 8px;border-radius:10px;font-weight:600;">${item.type === 'error' ? '错误' : '警告'}</span>`;
            html += '</div>';
        });
        html += '</div>';
        modalBody.innerHTML = html;
    }

    modalFooter.innerHTML = `<button class="modal-btn modal-btn-primary" onclick="closeModal('dynamicModal')">关闭</button>`;
    showModal('dynamicModal');
}

/* ========== 侧边栏面板渲染 ========== */

/* 获取本地化文本的辅助函数 */
function _getLocalizedText(obj) {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    return obj['zh-Hans'] || obj['zh'] || obj['en'] || '';
}

/* 截断文本辅助函数 */
function _truncateText(text, maxLen) {
    if (!text) return '';
    maxLen = maxLen || 30;
    return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
}

/* 渲染 info.json 编辑面板到 #info-panel 容器 */
function renderInfoJsonPanel() {
    const container = document.getElementById('info-panel');
    if (!container) return;

    if (!infoJsonData) {
        container.innerHTML = '<p style="padding:12px;color:#888;">数据未加载</p>';
        return;
    }

    let html = '';

    /* ===== 基础信息区 ===== */
    html += '<div class="info-json-section info-json-basic">';
    html += '<div class="info-json-section-title">基础信息</div>';

    const basicFields = [
        { key: 'Name', label: 'Mod名称' },
        { key: 'Description', label: 'Mod描述' },
        { key: 'Author', label: 'Mod作者' },
        { key: 'Enter', label: 'Mod指针' },
        { key: 'Version', label: 'Mod版本' }
    ];
    basicFields.forEach(field => {
        const val = field.key === 'Enter' || field.key === 'Version'
            ? (infoJsonData[field.key] || '')
            : _getLocalizedText(infoJsonData[field.key]);
        const displayVal = val ? escapeHtml(_truncateText(val, 40)) : '<span style="color:#aaa;">未设置</span>';
        html += `<div class="info-json-field-row" onclick="openInfoEditModal('basic', null)" title="点击编辑">`;
        html += `<span class="info-json-field-label">${escapeHtml(field.label)}</span>`;
        html += `<span class="info-json-field-value">${displayVal}</span>`;
        html += `<span class="info-json-field-edit-btn">✏️</span>`;
        html += '</div>';
    });
    html += '</div>';

    /* ===== 分类折叠区 ===== */
    const sections = [
        { key: 'characters', label: '角色', dataKey: 'Characters', icon: '' },
        { key: 'clues', label: '证物', dataKey: 'Clues', icon: '' },
        { key: 'profiles', label: '人物档案', dataKey: 'Profiles', icon: '' },
        { key: 'rules', label: '规则', dataKey: 'Rules', icon: '' },
        { key: 'notes', label: '笔记', dataKey: 'Notes', icon: '' },
        { key: 'chapternames', label: '章节名', dataKey: 'ChapterNames', icon: '' }
    ];

    sections.forEach((sec, secIdx) => {
        const data = infoJsonData[sec.dataKey];
        let count = 0;
        if (Array.isArray(data)) {
            count = data.length;
        } else if (typeof data === 'object' && data !== null) {
            count = Object.keys(data).length;
        }

        html += `<div class="info-json-section" id="info-section-${sec.key}">`;
        html += `<div class="info-json-section-header" onclick="toggleInfoSection('${sec.key}')">`;
        html += `<span class="info-json-section-toggle" id="info-toggle-${sec.key}">▸</span>`;
        html += `<span class="info-json-section-icon">${sec.icon}</span>`;
        html += `<span class="info-json-section-label">${escapeHtml(sec.label)}</span>`;
        html += `<span class="info-json-section-count">${count}</span>`;
        html += `<button class="info-json-add-btn" onclick="event.stopPropagation();openInfoAddModal('${sec.key}')" title="新增">+</button>`;
        html += '</div>';
        html += `<div class="info-json-section-body" id="info-body-${sec.key}" style="display:none;">`;

        if (Array.isArray(data)) {
            if (data.length === 0) {
                html += '<div class="info-json-empty">暂无条目</div>';
            } else {
                data.forEach((item, idx) => {
                    html += _renderListItem(sec.key, item, idx);
                });
            }
        } else if (typeof data === 'object' && data !== null) {
            const keys = Object.keys(data);
            if (keys.length === 0) {
                html += '<div class="info-json-empty">暂无条目</div>';
            } else {
                keys.forEach((key, idx) => {
                    const val = data[key];
                    const preview = typeof val === 'object' ? _getLocalizedText(val) : (val || '');
                    html += `<div class="info-json-item" data-section="${sec.key}" data-key="${escapeHtml(key)}">`;
                    html += `<div class="info-json-item-main" onclick="openInfoEditModal('${sec.key}', '${escapeHtml(key)}')">`;
                    html += `<span class="info-json-item-id">${escapeHtml(_truncateText(key, 35))}</span>`;
                    html += `<span class="info-json-item-preview">${escapeHtml(_truncateText(preview, 30))}</span>`;
                    html += '</div>';
                    html += `<div class="info-json-item-actions">`;
                    html += `<button class="info-json-btn-edit" onclick="openInfoEditModal('${sec.key}', '${escapeHtml(key)}')" title="编辑">✏️</button>`;
                    html += `<button class="info-json-btn-delete" onclick="deleteInfoItem('${sec.key}', '${escapeHtml(key)}')" title="删除">🗑️</button>`;
                    html += '</div>';
                    html += '</div>';
                });
            }
        }

        html += '</div></div>';
    });

    /* ===== 底部操作按钮 ===== */
    html += '<div class="info-json-actions">';
    html += '<button class="info-json-action-btn" onclick="importInfoJson()">导入</button>';
    html += '<button class="info-json-action-btn" onclick="exportInfoJson()">导出</button>';
    html += '<button class="info-json-action-btn" onclick="showValidateResult()">校验</button>';
    html += '<button class="info-json-action-btn" onclick="loadInfoJson()">刷新</button>';
    html += '</div>';

    container.innerHTML = html;
}

/* 渲染数组类型条目的单行 */
function _renderListItem(sectionKey, item, idx) {
    let id = item.Id || '';
    let preview = '';
    let versionCount = 0;

    switch (sectionKey) {
        case 'characters':
            preview = _getLocalizedText(item.Name);
            if (item.FamilyName) {
                const family = _getLocalizedText(item.FamilyName);
                if (family) preview = family + preview;
            }
            break;
        case 'clues':
            if (item.Items && item.Items.length > 0) {
                versionCount = item.Items.length;
                preview = _getLocalizedText(item.Items[0].Name);
            }
            break;
        case 'profiles':
            if (item.Items && item.Items.length > 0) {
                versionCount = item.Items.length;
                preview = _truncateText(_getLocalizedText(item.Items[0].Description), 25);
            }
            break;
        case 'rules':
            if (item.Items && item.Items.length > 0) {
                versionCount = item.Items.length;
                preview = _getLocalizedText(item.Items[0].Subtitle);
            }
            break;
        case 'notes':
            if (item.Items && item.Items.length > 0) {
                versionCount = item.Items.length;
                preview = _getLocalizedText(item.Items[0].Title);
            }
            break;
    }

    let html = `<div class="info-json-item" data-section="${sectionKey}" data-idx="${idx}">`;
    html += `<div class="info-json-item-main" onclick="openInfoEditModal('${sectionKey}', '${escapeHtml(id)}')">`;
    html += `<span class="info-json-item-id">${escapeHtml(_truncateText(id, 35))}</span>`;
    html += `<span class="info-json-item-preview">${escapeHtml(_truncateText(preview, 30))}</span>`;
    if (versionCount > 0) {
        html += `<span class="info-json-version-badge" title="${versionCount} 个版本">v${versionCount}</span>`;
    }
    html += '</div>';
    html += `<div class="info-json-item-actions">`;
    html += `<button class="info-json-btn-edit" onclick="openInfoEditModal('${sectionKey}', '${escapeHtml(id)}')" title="编辑">✏️</button>`;
    html += `<button class="info-json-btn-delete" onclick="deleteInfoItem('${sectionKey}', '${escapeHtml(id)}')" title="删除">🗑️</button>`;
    html += '</div>';
    html += '</div>';
    return html;
}

/* 折叠/展开分类区 */
function toggleInfoSection(sectionKey) {
    const body = document.getElementById('info-body-' + sectionKey);
    const toggle = document.getElementById('info-toggle-' + sectionKey);
    if (!body || !toggle) return;

    if (body.style.display === 'none') {
        body.style.display = 'block';
        toggle.textContent = '▾';
    } else {
        body.style.display = 'none';
        toggle.textContent = '▸';
    }
}

/* 删除条目 */
function deleteInfoItem(sectionKey, itemId) {
    if (!confirm('确定要删除此条目吗？')) return;

    if (sectionKey === 'chapternames') {
        if (infoJsonData.ChapterNames && infoJsonData.ChapterNames[itemId] !== undefined) {
            delete infoJsonData.ChapterNames[itemId];
        }
    } else {
        const dataKeyMap = {
            'characters': 'Characters',
            'clues': 'Clues',
            'profiles': 'Profiles',
            'rules': 'Rules',
            'notes': 'Notes'
        };
        const dataKey = dataKeyMap[sectionKey];
        if (dataKey && infoJsonData[dataKey]) {
            const idx = infoJsonData[dataKey].findIndex(item => item.Id === itemId);
            if (idx !== -1) {
                infoJsonData[dataKey].splice(idx, 1);
            }
        }
    }

    saveInfoJsonToStorage();
    renderInfoJsonPanel();
    showSuccess('条目已删除');
}

/* ========== 编辑模态框 ========== */

/* 打开编辑模态框 */
function openInfoEditModal(section, itemId) {
    _infoEditSection = section;
    _infoEditItemId = itemId;

    const modalTitle = document.getElementById('dynamicModalTitle');
    const modalBody = document.getElementById('dynamicModalBody');
    const modalFooter = document.getElementById('dynamicModalFooter');

    const sectionLabels = {
        'basic': '编辑基础信息',
        'characters': '编辑角色',
        'clues': '编辑证物',
        'profiles': '编辑人物档案',
        'rules': '编辑规则',
        'notes': '编辑笔记',
        'chapternames': '编辑章节名'
    };
    modalTitle.textContent = sectionLabels[section] || '编辑';

    let bodyHtml = '';

    switch (section) {
        case 'basic':
            bodyHtml = _renderBasicForm();
            break;
        case 'characters':
            bodyHtml = _renderCharacterForm(itemId);
            break;
        case 'clues':
            bodyHtml = _renderVersionedForm('clues', itemId);
            break;
        case 'profiles':
            bodyHtml = _renderVersionedForm('profiles', itemId);
            break;
        case 'rules':
            bodyHtml = _renderVersionedForm('rules', itemId);
            break;
        case 'notes':
            bodyHtml = _renderVersionedForm('notes', itemId);
            break;
        case 'chapternames':
            bodyHtml = _renderChapterNameForm(itemId);
            break;
    }

    modalBody.innerHTML = bodyHtml;

    modalFooter.innerHTML = `
        <button class="modal-btn modal-btn-secondary" onclick="closeModal('dynamicModal')">取消</button>
        <button class="modal-btn modal-btn-primary" onclick="submitInfoEditModal()">保存</button>
    `;
    showModal('dynamicModal');
}

/* 打开新增模态框 */
function openInfoAddModal(section) {
    openInfoEditModal(section, null);
}

/* ===== 基础信息表单 ===== */
function _renderBasicForm() {
    const d = infoJsonData;
    let html = '<div class="form-group">';
    html += '<label>剧本名称 (zh-Hans)</label>';
    html += `<input type="text" id="info_basic_name" value="${escapeHtml(_getLocalizedText(d.Name))}" placeholder="输入剧本名称">`;
    html += '</div>';
    html += '<div class="form-group">';
    html += '<label>描述 (zh-Hans)</label>';
    html += `<textarea id="info_basic_desc" rows="3" placeholder="输入描述">${escapeHtml(_getLocalizedText(d.Description))}</textarea>`;
    html += '</div>';
    html += '<div class="form-group">';
    html += '<label>作者 (zh-Hans)</label>';
    html += `<input type="text" id="info_basic_author" value="${escapeHtml(_getLocalizedText(d.Author))}" placeholder="输入作者">`;
    html += '</div>';
    html += '<div class="form-group">';
    html += '<label>入口剧本</label>';
    html += `<input type="text" id="info_basic_enter" value="${escapeHtml(d.Enter || '')}" placeholder="输入起始剧本">`;
    html += '</div>';
    html += '<div class="form-group">';
    html += '<label>版本</label>';
    html += `<input type="text" id="info_basic_version" value="${escapeHtml(d.Version || '')}" placeholder="输入Mod版本">`;
    html += '</div>';
    return html;
}

/* ===== 角色表单 ===== */
function _renderCharacterForm(itemId) {
    let char = null;
    if (itemId && infoJsonData.Characters) {
        char = infoJsonData.Characters.find(c => c.Id === itemId);
    }

    const id = char ? char.Id : '';
    const name = char ? _getLocalizedText(char.Name) : '';
    const familyName = char ? _getLocalizedText(char.FamilyName) : '';
    const color = char ? (char.Color || '#ffffff') : '#ffffff';
    const age = char ? (char.Age || '') : '';
    const height = char ? (char.Height || '') : '';
    const weight = char ? (char.Weight || '') : '';

    let html = '<div class="form-group">';
    html += '<label>Id <span class="required">*</span></label>';
    html += `<input type="text" id="info_char_id" value="${escapeHtml(id)}" placeholder="角色唯一标识" ${itemId ? 'readonly' : ''}>`;
    html += '</div>';
    html += '<div class="form-group">';
    html += '<label>名称 (zh-Hans)</label>';
    html += `<input type="text" id="info_char_name" value="${escapeHtml(name)}" placeholder="角色名">`;
    html += '</div>';
    html += '<div class="form-group">';
    html += '<label>姓氏 (zh-Hans)</label>';
    html += `<input type="text" id="info_char_family" value="${escapeHtml(familyName)}" placeholder="姓氏">`;
    html += '</div>';
    html += '<div class="form-group">';
    html += '<label>颜色</label>';
    html += `<div style="display:flex;align-items:center;gap:8px;">`;
    html += `<input type="color" id="info_char_color" value="${escapeHtml(color)}" style="width:50px;height:32px;padding:2px;border:1px solid #ddd;border-radius:4px;cursor:pointer;">`;
    html += `<input type="text" id="info_char_color_text" value="${escapeHtml(color)}" placeholder="#ffffff" style="flex:1;">`;
    html += '</div>';
    html += '</div>';
    html += '<div class="form-group">';
    html += '<label>年龄</label>';
    html += `<input type="text" id="info_char_age" value="${escapeHtml(age)}" placeholder="选填">`;
    html += '</div>';
    html += '<div class="form-group">';
    html += '<label>身高</label>';
    html += `<input type="text" id="info_char_height" value="${escapeHtml(height)}" placeholder="选填">`;
    html += '</div>';
    html += '<div class="form-group">';
    html += '<label>体重</label>';
    html += `<input type="text" id="info_char_weight" value="${escapeHtml(weight)}" placeholder="选填">`;
    html += '</div>';
    return html;
}

/* ===== 版本化条目表单（证物/人物档案/规则/笔记） ===== */
function _renderVersionedForm(section, itemId) {
    const dataKeyMap = {
        'clues': 'Clues',
        'profiles': 'Profiles',
        'rules': 'Rules',
        'notes': 'Notes'
    };
    const dataKey = dataKeyMap[section];
    let entry = null;

    if (itemId && infoJsonData[dataKey]) {
        entry = infoJsonData[dataKey].find(e => e.Id === itemId);
    }

    const id = entry ? entry.Id : '';
    const items = entry ? entry.Items : [];

    let html = '<div class="form-group">';
    html += '<label>Id <span class="required">*</span></label>';
    html += `<input type="text" id="info_vitem_id" value="${escapeHtml(id)}" placeholder="唯一标识" ${itemId ? 'readonly' : ''}>`;
    html += '</div>';

    html += `<div class="info-json-version-section">`;
    html += `<div class="info-json-version-header">`;
    html += `<span>版本列表</span>`;
    html += `<button type="button" class="info-json-add-version-btn" onclick="addVersionRow('info_version_list', '${section}')">+ 添加版本</button>`;
    html += '</div>';
    html += `<div id="info_version_list">`;

    items.forEach((item, idx) => {
        html += _renderVersionRow(section, idx, item);
    });

    /* 如果没有版本，添加一个空行 */
    if (items.length === 0) {
        html += _renderVersionRow(section, 0, null);
    }

    html += '</div></div>';
    return html;
}

/* 渲染单个版本行 */
function _renderVersionRow(section, idx, item) {
    let html = `<div class="info-json-version-row" data-version-idx="${idx}">`;
    html += `<div class="info-json-version-row-header">`;
    html += `<span>版本 #${idx + 1}</span>`;
    html += `<button type="button" class="info-json-remove-version-btn" onclick="removeVersionRow(this)">✕ 删除</button>`;
    html += '</div>';

    html += '<div class="form-group">';
    html += '<label>Version</label>';
    html += `<input type="number" class="info-version-num" value="${item ? item.Version : (idx + 1)}" placeholder="版本号" min="1">`;
    html += '</div>';

    switch (section) {
        case 'clues':
            html += '<div class="form-group">';
            html += '<label>名称 (zh-Hans)</label>';
            html += `<input type="text" class="info-version-name" value="${escapeHtml(item ? _getLocalizedText(item.Name) : '')}" placeholder="证物名称">`;
            html += '</div>';
            html += '<div class="form-group">';
            html += '<label>描述 (zh-Hans)</label>';
            html += `<textarea class="info-version-desc" rows="2" placeholder="证物描述">${escapeHtml(item ? _getLocalizedText(item.Description) : '')}</textarea>`;
            html += '</div>';
            break;
        case 'profiles':
            html += '<div class="form-group">';
            html += '<label>描述 (zh-Hans)</label>';
            html += `<textarea class="info-version-desc" rows="3" placeholder="人物描述">${escapeHtml(item ? _getLocalizedText(item.Description) : '')}</textarea>`;
            html += '</div>';
            break;
        case 'rules':
            html += '<div class="form-group">';
            html += '<label>编号</label>';
            html += `<input type="text" class="info-version-numbering" value="${escapeHtml(item ? (item.Numbering || '') : '')}" placeholder="如 Ⅰ">`;
            html += '</div>';
            html += '<div class="form-group">';
            html += '<label>副标题 (zh-Hans)</label>';
            html += `<input type="text" class="info-version-subtitle" value="${escapeHtml(item ? _getLocalizedText(item.Subtitle) : '')}" placeholder="副标题">`;
            html += '</div>';
            html += '<div class="form-group">';
            html += '<label>描述 (zh-Hans)</label>';
            html += `<textarea class="info-version-desc" rows="2" placeholder="规则描述">${escapeHtml(item ? _getLocalizedText(item.Description) : '')}</textarea>`;
            html += '</div>';
            break;
        case 'notes':
            html += '<div class="form-group">';
            html += '<label>标题 (zh-Hans)</label>';
            html += `<input type="text" class="info-version-title" value="${escapeHtml(item ? _getLocalizedText(item.Title) : '')}" placeholder="笔记标题">`;
            html += '</div>';
            html += '<div class="form-group">';
            html += '<label>描述 (zh-Hans)</label>';
            html += `<textarea class="info-version-desc" rows="3" placeholder="笔记描述">${escapeHtml(item ? _getLocalizedText(item.Description) : '')}</textarea>`;
            html += '</div>';
            break;
    }

    html += '</div>';
    return html;
}

/* ===== 章节名表单 ===== */
function _renderChapterNameForm(itemId) {
    let val = '';
    if (itemId && infoJsonData.ChapterNames && infoJsonData.ChapterNames[itemId] !== undefined) {
        val = _getLocalizedText(infoJsonData.ChapterNames[itemId]);
    }

    let html = '<div class="form-group">';
    html += '<label>剧本路径 (键) <span class="required">*</span></label>';
    html += `<input type="text" id="info_chapter_key" value="${escapeHtml(itemId || '')}" placeholder="如 CampusLife_002/Main_1" ${itemId ? 'readonly' : ''}>`;
    html += '</div>';
    html += '<div class="form-group">';
    html += '<label>标题 (zh-Hans 富文本)</label>';
    html += `<textarea id="info_chapter_value" rows="3" placeholder="支持富文本标签，如 &lt;voffset=-1em&gt;标题&lt;/voffset&gt;">${escapeHtml(val)}</textarea>`;
    html += '</div>';
    html += '<div style="font-size:12px;color:#888;margin-top:4px;">';
    html += '提示：支持 Rich Text 标签，如 &lt;voffset&gt;、&lt;size&gt;、&lt;br&gt; 等。';
    html += '</div>';
    return html;
}

/* ========== 版本行管理 ========== */

/* 在模态框中添加一个版本行 */
function addVersionRow(containerId, section) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const rows = container.querySelectorAll('.info-json-version-row');
    const newIdx = rows.length;
    const newRowHtml = _renderVersionRow(section, newIdx, null);
    container.insertAdjacentHTML('beforeend', newRowHtml);

    /* 滚动到新行 */
    const newRow = container.querySelector(`.info-json-version-row[data-version-idx="${newIdx}"]`);
    if (newRow) {
        newRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

/* 删除一个版本行 */
function removeVersionRow(btn) {
    const row = btn.closest('.info-json-version-row');
    if (!row) return;
    const container = row.parentElement;
    if (!container) return;

    const rows = container.querySelectorAll('.info-json-version-row');
    if (rows.length <= 1) {
        showError('至少保留一个版本');
        return;
    }

    row.remove();

    /* 重新编号 */
    const remainingRows = container.querySelectorAll('.info-json-version-row');
    remainingRows.forEach((r, idx) => {
        r.setAttribute('data-version-idx', idx);
        const headerSpan = r.querySelector('.info-json-version-row-header span');
        if (headerSpan) headerSpan.textContent = '版本 #' + (idx + 1);
    });
}

/* ========== 表单提交 ========== */

/* 收集表单数据，更新 infoJsonData，重新渲染面板，保存到 localStorage */
function submitInfoEditModal() {
    const section = _infoEditSection;
    const itemId = _infoEditItemId;

    let success = true;
    switch (section) {
        case 'basic':
            _submitBasicForm();
            break;
        case 'characters':
            success = _submitCharacterForm(itemId);
            break;
        case 'clues':
        case 'profiles':
        case 'rules':
        case 'notes':
            success = _submitVersionedForm(section, itemId);
            break;
        case 'chapternames':
            success = _submitChapterNameForm(itemId);
            break;
    }

    if (!success) return;

    saveInfoJsonToStorage();
    renderInfoJsonPanel();
    closeModal('dynamicModal');
    showSuccess('保存成功');
}

/* 提交基础信息 */
function _submitBasicForm() {
    infoJsonData.Name = { 'zh-Hans': _getVal('info_basic_name') };
    infoJsonData.Description = { 'zh-Hans': _getVal('info_basic_desc') };
    infoJsonData.Author = { 'zh-Hans': _getVal('info_basic_author') };
    infoJsonData.Enter = _getVal('info_basic_enter');
    infoJsonData.Version = _getVal('info_basic_version');
}

/* 提交角色表单 */
function _submitCharacterForm(itemId) {
    const id = _getVal('info_char_id');
    if (!id) { showError('角色 Id 不能为空'); return false; }

    const charData = {
        'Id': id,
        'Name': { 'zh-Hans': _getVal('info_char_name') },
        'FamilyName': { 'zh-Hans': _getVal('info_char_family') },
        'Color': _getVal('info_char_color') || '#ffffff',
        'Age': _getVal('info_char_age'),
        'Height': _getVal('info_char_height'),
        'Weight': _getVal('info_char_weight')
    };

    if (itemId) {
        /* 编辑已有角色 */
        const idx = infoJsonData.Characters.findIndex(c => c.Id === itemId);
        if (idx !== -1) {
            infoJsonData.Characters[idx] = charData;
        }
    } else {
        /* 新增角色 */
        infoJsonData.Characters.push(charData);
    }
    return true;
}

/* 提交版本化条目表单 */
function _submitVersionedForm(section, itemId) {
    const dataKeyMap = {
        'clues': 'Clues',
        'profiles': 'Profiles',
        'rules': 'Rules',
        'notes': 'Notes'
    };
    const dataKey = dataKeyMap[section];
    const id = _getVal('info_vitem_id');
    if (!id) { showError('Id 不能为空'); return false; }

    /* 收集版本行数据 */
    const versionRows = document.querySelectorAll('#info_version_list .info-json-version-row');
    const items = [];

    versionRows.forEach(row => {
        const version = parseInt(row.querySelector('.info-version-num').value) || 1;
        let itemData = { 'Version': version };

        switch (section) {
            case 'clues':
                itemData.Name = { 'zh-Hans': _getValFromEl(row.querySelector('.info-version-name')) };
                itemData.Description = { 'zh-Hans': _getValFromEl(row.querySelector('.info-version-desc')) };
                break;
            case 'profiles':
                itemData.Description = { 'zh-Hans': _getValFromEl(row.querySelector('.info-version-desc')) };
                break;
            case 'rules':
                itemData.Numbering = _getValFromEl(row.querySelector('.info-version-numbering'));
                itemData.Subtitle = { 'zh-Hans': _getValFromEl(row.querySelector('.info-version-subtitle')) };
                itemData.Description = { 'zh-Hans': _getValFromEl(row.querySelector('.info-version-desc')) };
                break;
            case 'notes':
                itemData.Title = { 'zh-Hans': _getValFromEl(row.querySelector('.info-version-title')) };
                itemData.Description = { 'zh-Hans': _getValFromEl(row.querySelector('.info-version-desc')) };
                break;
        }

        items.push(itemData);
    });

    const entry = { 'Id': id, 'Items': items };

    if (itemId) {
        /* 编辑已有条目 */
        const idx = infoJsonData[dataKey].findIndex(e => e.Id === itemId);
        if (idx !== -1) {
            infoJsonData[dataKey][idx] = entry;
        }
    } else {
        /* 新增条目 */
        infoJsonData[dataKey].push(entry);
    }
    return true;
}

/* 提交章节名表单 */
function _submitChapterNameForm(itemId) {
    const key = _getVal('info_chapter_key');
    const value = _getVal('info_chapter_value');
    if (!key) { showError('剧本路径不能为空'); return false; }

    infoJsonData.ChapterNames[key] = { 'zh-Hans': value };
    return true;
}

/* 获取输入框值的辅助函数 */
function _getVal(elementId) {
    const el = document.getElementById(elementId);
    return el ? el.value.trim() : '';
}

/* 从元素获取值的辅助函数 */
function _getValFromEl(el) {
    return el ? el.value.trim() : '';
}

/* ========== 工具联动 ========== */

/* 返回所有证物 ID 列表 */
function getInfoClueIds() {
    if (!infoJsonData || !infoJsonData.Clues) return [];
    return infoJsonData.Clues.map(c => c.Id).filter(Boolean);
}

/* 返回所有人物档案 ID 列表 */
function getInfoProfileIds() {
    if (!infoJsonData || !infoJsonData.Profiles) return [];
    return infoJsonData.Profiles.map(p => p.Id).filter(Boolean);
}

/* 返回所有规则 ID 列表 */
function getInfoRuleIds() {
    if (!infoJsonData || !infoJsonData.Rules) return [];
    return infoJsonData.Rules.map(r => r.Id).filter(Boolean);
}

/* 返回所有笔记 ID 列表 */
function getInfoNoteIds() {
    if (!infoJsonData || !infoJsonData.Notes) return [];
    return infoJsonData.Notes.map(n => n.Id).filter(Boolean);
}

/* 返回所有角色 ID 列表 */
function getInfoCharacterIds() {
    if (!infoJsonData || !infoJsonData.Characters) return [];
    return infoJsonData.Characters.map(c => c.Id).filter(Boolean);
}

/* 获取指定条目的最大版本号 */
function getMaxVersion(section, id) {
    const dataKeyMap = {
        'clues': 'Clues',
        'profiles': 'Profiles',
        'rules': 'Rules',
        'notes': 'Notes'
    };
    const dataKey = dataKeyMap[section];
    if (!dataKey || !infoJsonData || !infoJsonData[dataKey]) return 0;

    const entry = infoJsonData[dataKey].find(e => e.Id === id);
    if (!entry || !entry.Items || entry.Items.length === 0) return 0;

    return Math.max(...entry.Items.map(item => item.Version || 0));
}

/* 返回角色下拉选项字符串，格式为 "中文名（Id）|Id" 用 "、" 连接 */
function getInfoCharacterOptions() {
    if (!infoJsonData || !infoJsonData.Characters || infoJsonData.Characters.length === 0) return '';
    return infoJsonData.Characters.map(char => {
        const name = _getLocalizedText(char.Name);
        const family = _getLocalizedText(char.FamilyName);
        const fullName = family ? (family + name) : name;
        return `${fullName}（${char.Id}）|${char.Id}`;
    }).join('、');
}

/* ========== 初始化 ========== */

/* 供顶部菜单调用的校验入口 */
function validateAndShowInfoJson() {
    /* 如果面板未激活，先激活面板 */
    if (!infoJsonPanelActive) {
        const select = document.getElementById('sidebarSelect');
        if (select) {
            select.value = '-1';
            switchSidebarContent('-1');
        }
    }
    showValidateResult();
}

/* 页面加载时自动加载 info.json */
(function initInfoJsonEditor() {
    loadInfoJson();
})();
