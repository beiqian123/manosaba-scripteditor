/* --- 快捷工具配置：核心 CRUD 与交互 ---
 *   init, loadConfig 配置加载
 *   renderCategories, renderItems 分类/选项列表渲染
 *   renderFields, renderFieldSections 必填/选填字段渲染
 *   handleDragStart/End/Drop 分类内/间拖拽排序
 *   showItemEditor, saveItem, deleteItem 选项编辑
 *   addField, editField, removeField, submitFieldModal 字段管理
 *   showAddCategoryModal, editCategory, submitCategoryModal 分类管理
 *   showSuccess, showError, escapeHtml 工具函数
 *   downloadConfig, goBack 下载与返回
 *   依赖: config-rich-text.js (execRichCmd, insertImageLink 等富文本) */

let config = { categories: [], panels: [] };
let currentCategoryIndex = -1;
let currentItemIndex = -1;
let editingCategoryIndex = -1;
let editingFieldIndex = -1;
let editingPanelIndex = 'all';
let draggedItem = null;
let draggedFromCategory = -1;
let draggedFromIndex = -1;
let draggedCategoryIndex = -1;
let dragOverCategoryIndex = -1;
let draggedPanelIndex = -1;

/* 从 JSON 加载快捷工具配置 */
async function loadConfig() {
    try {
        const response = await fetch('快捷工具配置.json?' + Date.now());
        if (response.ok) {
            config = await response.json();
        } else {
            config = { categories: [], panels: [] };
        }
        if (!config.panels) {
            config.panels = [{ name: '日常模式', categories: [] }];
        }
        editingPanelIndex = 'all';
    } catch (error) {
        config = { categories: [], panels: [{ name: '日常模式', categories: [] }] };
        editingPanelIndex = 'all';
    }
}

/* 初始化：加载配置并渲染 */
async function init() {
    await loadConfig();
    renderPanels();
    renderCategories();
}

/* 渲染面板下拉选择器 */
function renderPanels() {
    const selector = document.getElementById('panelSelector');
    if (!selector) return;
    
    selector.innerHTML = '';
    
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = '≡ 全部';
    selector.appendChild(allOption);
    
    if (!config.panels || config.panels.length === 0) {
        allOption.textContent = '暂无面板';
        return;
    }
    
    config.panels.forEach((panel, panelIndex) => {
        const option = document.createElement('option');
        option.value = panelIndex;
        option.textContent = panel.name;
        selector.appendChild(option);
    });
    
    if (editingPanelIndex !== -1) {
        if (editingPanelIndex === 'all') {
            selector.value = 'all';
        } else if (editingPanelIndex < config.panels.length) {
            selector.value = editingPanelIndex;
        }
    }
}

/* 从下拉框选择面板 */
function selectPanelFromDropdown(panelIndex) {
    if (panelIndex === 'all') {
        editingPanelIndex = 'all';
    } else {
        editingPanelIndex = parseInt(panelIndex, 10);
        if (isNaN(editingPanelIndex)) editingPanelIndex = 0;
    }
    renderCategories();
}

/* 显示添加面板弹窗 */
function showAddPanelModal() {
    editingPanelIndex = -1;
    document.getElementById('panelModalTitle').textContent = '添加面板';
    document.getElementById('panelNameInput').value = '';
    renderPanelCategoryCheckboxes([]);
    document.getElementById('panelModal').classList.add('show');
}

/* 显示面板管理列表弹窗 */
function showPanelListModal() {
    renderPanelManagementList();
    document.getElementById('panelListModal').classList.add('show');
}

/* 关闭面板管理列表弹窗 */
function closePanelListModal() {
    document.getElementById('panelListModal').classList.remove('show');
}

/* 渲染面板管理列表 */
function renderPanelManagementList() {
    const container = document.getElementById('panelManagementList');
    if (!config.panels || config.panels.length === 0) {
        container.innerHTML = '<div class="empty-hint">暂无面板</div>';
        return;
    }
    
    let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
    config.panels.forEach((panel, index) => {
        const categoryCount = panel.categories && panel.categories.length > 0
            ? panel.categories.length
            : '全部';
        html += `
            <div class="panel-drag-item" draggable="true"
                ondragstart="handlePanelDragStart(event, ${index})"
                ondragend="handlePanelDragEnd()"
                ondragover="handlePanelDragOver(event, ${index})"
                ondragleave="handlePanelDragLeave(${index})"
                ondrop="handlePanelDrop(event, ${index})"
                style="display: flex; align-items: center; padding: 10px; border: 1px solid #e0e0e0; border-radius: 6px; background: linear-gradient(135deg, #faf5ff, #f3e8ff); cursor: grab;">
                <span class="panel-drag-handle" style="cursor: grab; padding: 0 8px; color: #aaa; font-size: 18px;">⠿</span>
                <div style="flex: 1;">
                    <div style="font-weight: 600; color: #6a1b9a;">${escapeHtml(panel.name)}</div>
                    <div style="font-size: 12px; color: #888; margin-top: 4px;">包含 ${categoryCount} 个分类</div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button onclick="editPanel(${index})" style="padding: 5px 12px; font-size: 12px; background: #6a1b9a; color: white; border: 1px solid #6a1b9a; border-radius: 4px; cursor: pointer;">编辑</button>
                    <button onclick="deletePanel(${index})" style="padding: 5px 12px; font-size: 12px; background: #d32f2f; color: white; border: 1px solid #d32f2f; border-radius: 4px; cursor: pointer;">删除</button>
                </div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

/* 编辑面板 */
function editPanel(index) {
    editingPanelIndex = index;
    const panel = config.panels[index];
    document.getElementById('panelModalTitle').textContent = '编辑面板';
    document.getElementById('panelNameInput').value = panel.name;
    renderPanelCategoryCheckboxes(panel.categories || []);
    document.getElementById('panelModal').classList.add('show');
}

/* 渲染面板的分类复选框 */
function renderPanelCategoryCheckboxes(selectedCategories) {
    const container = document.getElementById('panelCategoriesCheckboxes');
    if (!config.categories || config.categories.length === 0) {
        container.innerHTML = '<div class="empty-hint">暂无分类，请先添加分类</div>';
        return;
    }
    
    let html = '';
    config.categories.forEach((category, catIndex) => {
        const isChecked = selectedCategories.length === 0 || selectedCategories.includes(category.name);
        html += `
            <label style="display: flex; align-items: center; margin-bottom: 8px; cursor: pointer;">
                <input type="checkbox" value="${escapeHtml(category.name)}" ${isChecked ? 'checked' : ''} 
                    class="panel-category-checkbox" style="width: auto; margin-right: 8px;">
                <span>${escapeHtml(category.name)}</span>
                <span style="color: #888; font-size: 12px; margin-left: 4px;">(${category.items.length})</span>
            </label>
        `;
    });
    
    container.innerHTML = html;
}

/* 关闭面板编辑弹窗 */
function closePanelModal() {
    document.getElementById('panelModal').classList.remove('show');
    document.getElementById('panelListModal').classList.remove('show');
}

/* 提交面板编辑 */
function submitPanelModal() {
    const name = document.getElementById('panelNameInput').value.trim();
    if (!name) {
        showError('请输入面板名称');
        return;
    }
    
    const checkboxes = document.querySelectorAll('.panel-category-checkbox:checked');
    const selectedCategories = Array.from(checkboxes).map(cb => cb.value);
    
    const panelData = {
        name,
        categories: selectedCategories
    };
    
    if (editingPanelIndex === -1) {
        editingPanelIndex = config.panels.length;
        config.panels.push(panelData);
        showSuccess('面板添加成功');
    } else {
        config.panels[editingPanelIndex] = panelData;
        showSuccess('面板修改成功');
    }
    
    closePanelModal();
    renderPanels();
    renderCategories();
}

/* 删除面板 */
function deletePanel(index) {
    if (config.panels.length <= 1) {
        showError('至少需要保留一个面板');
        return;
    }
    if (!confirm('确定要删除这个面板吗？')) return;
    
    config.panels.splice(index, 1);
    
    if (editingPanelIndex === 'all' || editingPanelIndex === index) {
        editingPanelIndex = 'all';
    } else if (typeof editingPanelIndex === 'number' && editingPanelIndex > index) {
        editingPanelIndex--;
    } else if (typeof editingPanelIndex === 'number' && editingPanelIndex >= config.panels.length) {
        editingPanelIndex = config.panels.length - 1;
    }
    
    renderPanels();
    renderPanelManagementList();
    renderCategories();
    showSuccess('面板已删除');
}

/* 面板拖拽开始 */
function handlePanelDragStart(event, index) {
    draggedPanelIndex = index;
    event.target.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', 'panel');
}

/* 面板拖拽结束 */
function handlePanelDragEnd() {
    draggedPanelIndex = -1;
    document.querySelectorAll('.panel-drag-item').forEach(el => {
        el.classList.remove('dragging', 'drag-over');
    });
}

/* 面板拖拽悬停 */
function handlePanelDragOver(event, index) {
    event.preventDefault();
    if (draggedPanelIndex === -1 || draggedPanelIndex === index) return;
    event.dataTransfer.dropEffect = 'move';
    event.currentTarget.classList.add('drag-over');
}

/* 面板拖拽离开 */
function handlePanelDragLeave(index) {
    document.querySelectorAll('.panel-drag-item')[index]?.classList.remove('drag-over');
}

/* 面板拖拽放下 */
function handlePanelDrop(event, targetIndex) {
    event.preventDefault();
    if (draggedPanelIndex === -1 || draggedPanelIndex === targetIndex) {
        handlePanelDragEnd();
        return;
    }
    
    const [movedPanel] = config.panels.splice(draggedPanelIndex, 1);
    config.panels.splice(targetIndex, 0, movedPanel);
    
    if (typeof editingPanelIndex === 'number') {
        if (editingPanelIndex === draggedPanelIndex) {
            editingPanelIndex = targetIndex;
        } else if (draggedPanelIndex < editingPanelIndex && targetIndex >= editingPanelIndex) {
            editingPanelIndex--;
        } else if (draggedPanelIndex > editingPanelIndex && targetIndex <= editingPanelIndex) {
            editingPanelIndex++;
        }
    }
    
    handlePanelDragEnd();
    renderPanelManagementList();
    renderPanels();
    showSuccess('面板顺序已调整');
}

/* 下载配置文件到本地 */
function downloadConfig() {
    const configStr = JSON.stringify(config, null, 2);
    
    const blob = new Blob([configStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '快捷工具配置.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    const catCount = config.categories ? config.categories.length : 0;
    const itemCount = config.categories ? config.categories.reduce((sum, cat) => sum + cat.items.length, 0) : 0;
    showSuccess(`配置文件已下载！包含 ${catCount} 个分类，${itemCount} 个选项。请将文件替换到项目目录中。`);
}

/* 渲染所有分类列表 */
function renderCategories() {
    const container = document.getElementById('categoriesList');
    
    let categoriesToRender = config.categories || [];
    
    if (editingPanelIndex !== 'all' && editingPanelIndex !== -1 && config.panels && config.panels[editingPanelIndex]) {
        const panel = config.panels[editingPanelIndex];
        if (panel.categories && panel.categories.length > 0) {
            categoriesToRender = config.categories.filter(cat => panel.categories.includes(cat.name));
        }
    }
    
    if (categoriesToRender.length === 0) {
        container.innerHTML = '<div class="empty-hint">该面板没有配置任何分类</div>';
    } else {
        let html = '';
        categoriesToRender.forEach((category, catIndex) => {
            /* 计算在 config.categories 中的真实索引 */
            const realCatIndex = config.categories.indexOf(category);
            const isExpanded = currentCategoryIndex === realCatIndex;
            const isDragOver = dragOverCategoryIndex === realCatIndex;
            html += `
                <div class="category-item ${isDragOver ? 'drag-over-top' : ''}" draggable="true"
                    ondragstart="handleCatDragStart(event, ${realCatIndex})"
                    ondragend="handleCatDragEnd()"
                >
                    <div 
                        class="category-header ${isExpanded ? 'expanded' : ''}" 
                        onclick="toggleCategory(${realCatIndex})"
                        data-cat-index="${realCatIndex}"
                        ondragover="handleCategoryDragOver(event, ${realCatIndex})"
                        ondragleave="handleCategoryDragLeave(${realCatIndex})"
                        ondrop="handleCategoryDrop(event, ${realCatIndex})"
                        ondragenter="handleCategoryDragEnter(${realCatIndex})"
                    >
                        <span class="cat-drag-handle" title="拖动排序">⠿</span>
                        <div class="category-name">${escapeHtml(category.name)}</div>
                        <span class="category-count">${category.items.length}</span>
                        <div class="category-actions">
                            <button onclick="event.stopPropagation(); editCategory(${realCatIndex})">编辑</button>
                            <button onclick="event.stopPropagation(); deleteCategory(${realCatIndex})">删除</button>
                        </div>
                    </div>
                    <div 
                        class="category-items ${isExpanded ? 'expanded' : ''}"
                        id="categoryItems_${realCatIndex}"
                        ondragover="handleItemsDragOver(event, ${realCatIndex})"
                        ondragleave="handleItemsDragLeave(${realCatIndex})"
                        ondrop="handleItemsDrop(event, ${realCatIndex})"
                        ondragenter="handleItemsDragEnter(${realCatIndex})"
                    >
                        ${renderItems(category.items, realCatIndex)}
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    }
}

/* 渲染分类下的选项列表 */
function renderItems(items, catIndex) {
    if (!items || items.length === 0) {
        return `<div class="empty-hint">
            <button onclick="showAddItem(${catIndex})" style="color: #6a1b9a; cursor: pointer;">+ 添加选项</button>
        </div>`;
    }

    let html = '';
    items.forEach((item, itemIndex) => {
        const isSelected = currentCategoryIndex === catIndex && currentItemIndex === itemIndex;
        html += `
            <div 
                class="item-row ${isSelected ? 'selected' : ''}" 
                onclick="selectItem(${catIndex}, ${itemIndex})"
                draggable="true"
                ondragstart="handleDragStart(event, ${catIndex}, ${itemIndex})"
                ondragend="handleDragEnd()"
                ondragover="handleItemDragOver(event, ${catIndex}, ${itemIndex})"
                ondragleave="handleItemDragLeave(${catIndex}, ${itemIndex})"
                ondrop="handleItemDrop(event, ${catIndex}, ${itemIndex})"
                ondragenter="handleItemDragEnter(${catIndex}, ${itemIndex})"
            >
                <div class="drag-handle">⋮⋮</div>
                <div class="item-icon">${item.icon || '📝'}</div>
                <div class="item-name">${escapeHtml(item.name)}</div>
                <span class="item-type ${item.type}">${item.type === 'modal' ? '弹窗' : '直接'}</span>
                <div class="item-actions">
                    <button onclick="event.stopPropagation(); showAddItem(${catIndex}, ${itemIndex})">编辑</button>
                    <button onclick="event.stopPropagation(); deleteItem(${catIndex}, ${itemIndex})">删除</button>
                </div>
            </div>
        `;
    });
    html += `<div class="empty-hint">
        <button onclick="showAddItem(${catIndex})" style="color: #6a1b9a; cursor: pointer; font-size: 13px;">+ 添加选项</button>
    </div>`;
    return html;
}

let draggedFieldIndex = -1;
let draggedFieldCategory = null;

/* 渲染字段列表 */
function renderFields(fields) {
    if (!fields || fields.length === 0) {
        return renderFieldSections(fields);
    }
    return renderFieldSections(fields);
}

/* 按必填/选填分组渲染字段区域 */
function renderFieldSections(fields) {
    const requiredFields = [];
    const optionalFields = [];
    fields.forEach((field, index) => {
        if (field.fieldCategory === 'optional') {
            optionalFields.push({ field, index });
        } else {
            requiredFields.push({ field, index });
        }
    });

    let html = '';

    html += '<div class="field-category-section">';
    html += '<div class="category-header-bar required">📌 脚本必要字段 <span style="font-weight:400;font-size:11px;opacity:0.9;">直接参与主模板 {N} 替换</span></div>';
    html += `<div class="category-body" id="requiredFieldDropZone" ondragover="handleFieldZoneDragOver(event)" ondrop="handleFieldZoneDrop(event, 'required')" ondragleave="handleFieldZoneDragLeave()">`;
    if (requiredFields.length === 0) {
        html += '<div class="empty-hint">暂无必填字段，可拖入选填字段或添加新字段</div>';
    } else {
        requiredFields.forEach(({ field, index }) => {
            html += renderFieldItem(field, index);
        });
    }
    html += '</div></div>';

    html += '<div class="field-category-section">';
    html += '<div class="category-header-bar optional">⚙️ 脚本可选字段 <span style="font-weight:400;font-size:11px;opacity:0.9;">有值时使用独立模板追加</span></div>';
    html += `<div class="category-body" id="optionalFieldDropZone" ondragover="handleFieldZoneDragOver(event)" ondrop="handleFieldZoneDrop(event, 'optional')" ondragleave="handleFieldZoneDragLeave()">`;
    if (optionalFields.length === 0) {
        html += '<div class="empty-hint">暂无选填字段，可将必填字段拖入此处设为选填</div>';
    } else {
        optionalFields.forEach(({ field, index }) => {
            html += renderFieldItem(field, index);
        });
    }
    html += '</div></div>';

    return html;
}

/* 渲染单个字段项 */
function renderFieldItem(field, index) {
    const outputTmpl = field.fieldCategory === 'optional' && field.outputTemplate
        ? `<div style="font-size:11px;color:#e65100;margin-top:4px;">输出模板: <code style="background:#fff3e0;padding:1px 4px;border-radius:3px;">${escapeHtml(field.outputTemplate)}</code></div>`
        : '';
    return `
        <div class="field-item" draggable="true"
            ondragstart="handleFieldDragStart(event, ${index})"
            ondragend="handleFieldDragEnd()"
            ondragover="handleFieldItemDragOver(event, ${index})"
            ondragleave="handleFieldItemDragLeave()"
            ondrop="handleFieldItemDrop(event, ${index})">
            <div class="field-info">
                <div class="field-header">
                    <div class="field-name">${escapeHtml(field.name)}</div>
                    <span class="field-type">${getFieldTypeName(field.type)}</span>
                </div>
                ${outputTmpl}
                ${field.options ? `<div class="field-options">选项: ${escapeHtml(field.options)}</div>` : ''}
            </div>
            <div class="field-actions">
                <button onclick="editField(${index})">编辑</button>
                <button onclick="removeField(${index})">删除</button>
            </div>
        </div>
    `;
}

/* 选项拖拽开始 */
function handleDragStart(event, catIndex, itemIndex) {
    draggedItem = config.categories[catIndex].items[itemIndex];
    draggedFromCategory = catIndex;
    draggedFromIndex = itemIndex;
    event.target.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd() {
    draggedItem = null;
    draggedFromCategory = -1;
    draggedFromIndex = -1;
    document.querySelectorAll('.item-row').forEach(el => el.classList.remove('dragging', 'drag-over'));
    document.querySelectorAll('.category-header').forEach(el => el.classList.remove('drag-over'));
    document.querySelectorAll('.category-items').forEach(el => el.classList.remove('drag-over'));
    document.querySelectorAll('.category-item').forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom'));
}

/* 分类拖拽开始 */
function handleCatDragStart(event, catIndex) {
    const target = event.target;
    if (target.classList.contains('item-row') || target.closest('.item-row')) {
        return;
    }
    draggedCategoryIndex = catIndex;
    event.target.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', 'category');
}

/* 分类拖拽结束 */
function handleCatDragEnd() {
    draggedCategoryIndex = -1;
    dragOverCategoryIndex = -1;
    document.querySelectorAll('.category-item').forEach(el => el.classList.remove('dragging', 'drag-over-top', 'drag-over-bottom'));
    document.querySelectorAll('.category-header').forEach(el => el.classList.remove('drag-over'));
}

/* 拖拽：分类悬停（支持选项放入和分类重排） */
function handleCategoryDragOver(event, catIndex) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    
    if (draggedCategoryIndex >= 0 && draggedCategoryIndex !== catIndex) {
        const rect = event.currentTarget.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const catItems = document.querySelectorAll('.category-item');
        catItems.forEach((el, idx) => {
            el.classList.remove('drag-over-top', 'drag-over-bottom');
        });
        if (event.clientY < midY) {
            catItems[catIndex].classList.add('drag-over-top');
        } else {
            catItems[catIndex].classList.add('drag-over-bottom');
        }
    }
}

/* 拖拽：分类进入悬停 */
function handleCategoryDragEnter(catIndex) {
    if (draggedCategoryIndex >= 0) return;
    document.querySelector(`.category-header[data-cat-index="${catIndex}"]`).classList.add('drag-over');
}

function handleCategoryDragLeave(catIndex) {
    document.querySelector(`.category-header[data-cat-index="${catIndex}"]`)?.classList.remove('drag-over');
    const catItems = document.querySelectorAll('.category-item');
    catItems.forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom'));
}

/* 拖拽：选项放入分类 OR 分类重排 */
function handleCategoryDrop(event, catIndex) {
    event.preventDefault();
    
    /* 分类重排 */
    if (draggedCategoryIndex >= 0) {
        if (draggedCategoryIndex === catIndex) {
            handleCatDragEnd();
            return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const insertBefore = event.clientY < midY;
        
        const [movedCat] = config.categories.splice(draggedCategoryIndex, 1);
        let targetIndex = catIndex;
        if (draggedCategoryIndex < catIndex) {
            targetIndex = insertBefore ? catIndex - 1 : catIndex;
        } else {
            targetIndex = insertBefore ? catIndex : catIndex + 1;
        }
        config.categories.splice(targetIndex, 0, movedCat);
        
        if (currentCategoryIndex === draggedCategoryIndex) {
            currentCategoryIndex = -1;
        } else if (currentCategoryIndex > draggedCategoryIndex && currentCategoryIndex <= targetIndex) {
            currentCategoryIndex--;
        } else if (currentCategoryIndex < draggedCategoryIndex && currentCategoryIndex >= targetIndex) {
            currentCategoryIndex++;
        }
        
        handleCatDragEnd();
        renderCategories();
        showSuccess('分类顺序已调整');
        return;
    }
    
    /* 选项放入分类 */
    if (!draggedItem) return;
    
    const category = config.categories[catIndex];
    
    if (draggedFromCategory !== catIndex) {
        config.categories[draggedFromCategory].items.splice(draggedFromIndex, 1);
        category.items.push(draggedItem);
        showSuccess(`选项已移动到「${category.name}」`);
    }
    
    handleDragEnd();
    renderCategories();
    if (currentCategoryIndex === draggedFromCategory && currentItemIndex === draggedFromIndex) {
        currentItemIndex = -1;
        document.getElementById('editorPanel').innerHTML = `
            <div class="editor-placeholder">
                <p>👈 请从左侧选择一个选项进行编辑</p>
                <p>或者点击某个分类下的「+」添加新选项</p>
            </div>
        `;
    }
}

/* 拖拽：选项列表进入悬停 */
function handleItemsDragOver(event, catIndex) {
    if (draggedCategoryIndex >= 0) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
}

/* 拖拽：选项列表进入悬停 */
function handleItemsDragEnter(catIndex) {
    if (draggedCategoryIndex >= 0) return;
    document.getElementById(`categoryItems_${catIndex}`).classList.add('drag-over');
}

/* 拖拽：选项列表离开悬停 */
function handleItemsDragLeave(catIndex) {
    if (draggedCategoryIndex >= 0) return;
    document.getElementById(`categoryItems_${catIndex}`).classList.remove('drag-over');
}

function handleItemsDrop(event, catIndex) {
    event.preventDefault();
    if (draggedCategoryIndex >= 0) return;
    if (!draggedItem) return;
    
    const targetCategory = config.categories[catIndex];
    
    if (draggedFromCategory !== catIndex) {
        config.categories[draggedFromCategory].items.splice(draggedFromIndex, 1);
        targetCategory.items.push(draggedItem);
        showSuccess(`选项已移动到「${targetCategory.name}」`);
    }
    
    handleDragEnd();
    renderCategories();
}

/* 拖拽：选项在项目上悬停 */
function handleItemDragOver(event, catIndex, itemIndex) {
    if (draggedCategoryIndex >= 0) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
}

/* 拖拽：选项进入项目悬停 */
function handleItemDragEnter(catIndex, itemIndex) {
    if (draggedCategoryIndex >= 0) return;
    const itemRows = document.getElementById(`categoryItems_${catIndex}`).querySelectorAll('.item-row');
    itemRows.forEach((row, idx) => {
        if (idx === itemIndex) {
            row.classList.add('drag-over');
        }
    });
}

/* 拖拽：选项离开项目悬停 */
function handleItemDragLeave(catIndex, itemIndex) {
    if (draggedCategoryIndex >= 0) return;
    const itemRows = document.getElementById(`categoryItems_${catIndex}`).querySelectorAll('.item-row');
    itemRows.forEach((row, idx) => {
        if (idx === itemIndex) {
            row.classList.remove('drag-over');
        }
    });
}

/* 拖拽：选项在分类内放入指定位置 */
function handleItemDrop(event, catIndex, itemIndex) {
    event.preventDefault();
    if (draggedCategoryIndex >= 0) return;
    if (!draggedItem) return;
    
    if (draggedFromCategory === catIndex && draggedFromIndex === itemIndex) {
        handleDragEnd();
        return;
    }
    
    config.categories[draggedFromCategory].items.splice(draggedFromIndex, 1);
    
    if (draggedFromCategory === catIndex) {
        /* 同分类内拖拽：删除后后续元素前移，目标索引在原位置之后需减 1 */
        if (draggedFromIndex < itemIndex) {
            config.categories[catIndex].items.splice(itemIndex - 1, 0, draggedItem);
        } else {
            config.categories[catIndex].items.splice(itemIndex, 0, draggedItem);
        }
        showSuccess('选项顺序已调整');
    } else {
        config.categories[catIndex].items.splice(itemIndex, 0, draggedItem);
        showSuccess(`选项已移动到「${config.categories[catIndex].name}」`);
    }
    
    handleDragEnd();
    renderCategories();
    if (currentCategoryIndex === draggedFromCategory && currentItemIndex === draggedFromIndex) {
        currentItemIndex = -1;
        document.getElementById('editorPanel').innerHTML = `
            <div class="editor-placeholder">
                <p>👈 请从左侧选择一个选项进行编辑</p>
                <p>或者点击某个分类下的「+」添加新选项</p>
            </div>
        `;
    }
}

/* 折叠/展开分类 */
function toggleCategory(index) {
    currentCategoryIndex = currentCategoryIndex === index ? -1 : index;
    renderCategories();
}

/* 选中某个选项 */
function selectItem(catIndex, itemIndex) {
    currentCategoryIndex = catIndex;
    currentItemIndex = itemIndex;
    renderCategories();
    showItemEditor(catIndex, itemIndex);
}

function showItemEditor(catIndex, itemIndex) {
    const item = config.categories[catIndex].items[itemIndex];
    const panel = document.getElementById('editorPanel');
    
    panel.innerHTML = `
        <div class="editor-panel-scroll">
        <div class="form-section">
            <div class="form-section-title">基本信息</div>
            <div class="form-row">
                <div class="form-label">选项名称：</div>
                <div class="form-control">
                    <input type="text" id="editItemName" value="${escapeHtml(item.name)}" placeholder="如：添加角色对话">
                </div>
            </div>
            <div class="form-row">
                <div class="form-label">图标（Emoji）：</div>
                <div class="form-control">
                    <input type="text" id="editItemIcon" value="${escapeHtml(item.icon || '')}" placeholder="如：💬">
                </div>
            </div>
            <div class="form-row">
                <div class="form-label">类型：</div>
                <div class="form-control">
                    <select id="editItemType" onchange="toggleItemTypeFields()">
                        <option value="modal" ${item.type === 'modal' ? 'selected' : ''}>弹窗输入（需要填写表单）</option>
                        <option value="direct" ${item.type === 'direct' ? 'selected' : ''}>直接插入（直接输出内容）</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-label">快捷键：</div>
                <div class="form-control">
                    <input type="text" id="editItemShortcut" value="${escapeHtml(item.shortcut || '')}" placeholder="如：Ctrl+O，支持 Ctrl/Alt/Shift + 字母">
                </div>
            </div>
            <div class="form-row form-row-toggle">
                <div class="form-label">悬浮提示：</div>
                <div class="form-control">
                    <label class="toggle-switch" style="display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none;">
                        <input type="checkbox" id="editItemTooltipEnabled" ${(item.tooltipEnabled !== false) ? 'checked' : ''} style="display: none;">
                        <span class="toggle-slider"></span>
                        <span style="font-size: 13px; color: #555;">开启即允许鼠标悬停到该命令上时，显示快速编辑、工具提示</span>
                    </label>
                </div>
            </div>
            <div class="form-row form-row-toggle">
                <div class="form-label">行内插入：</div>
                <div class="form-control">
                    <label class="toggle-switch" style="display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none;">
                        <input type="checkbox" id="editInlineInsert" ${item.inlineInsert ? 'checked' : ''} style="display: none;">
                        <span class="toggle-slider"></span>
                        <span style="font-size: 13px; color: #555;">开启后，点击此工具将在光标处直接插入内容，不会自动换行到下一行</span>
                    </label>
                </div>
            </div>
        </div>

        <div class="form-section">
            <div class="form-section-title">多行信息管理</div>
            <div class="form-row form-row-toggle">
                <div class="form-label">启用多行编辑：</div>
                <div class="form-control">
                    <label class="toggle-switch" style="display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none;">
                        <input type="checkbox" id="editMultiLineEdit" onchange="toggleMultiLineConfig()" ${item.multiLineEdit ? 'checked' : ''} style="display: none;">
                        <span class="toggle-slider"></span>
                        <span style="font-size: 13px; color: #555;">开启后，打开此工具时将显示多行列表编辑界面，可批量增删改条目</span>
                    </label>
                </div>
            </div>
            <div class="multi-line-edit-config" id="multiLineEditConfig" ${item.multiLineEdit ? '' : 'style="display:none;"'}>
                <div class="form-row">
                    <div class="form-label">行模板：</div>
                    <div class="form-control">
                        <input type="text" id="editLineTemplate" value="${escapeHtml(item.lineTemplate || '')}" placeholder="如：信息：{N}">
                        <div style="font-size: 12px; color: #6a1b9a; margin-top: 6px; padding: 6px 8px; background: #faf5ff; border-radius: 4px;">
                            💡 <strong>说明：</strong>使用 <code>{N}</code> 作为值的占位符。例如模板 <code>信息：{N},</code>，用户只需填写值。<br>
                            留空则每行直接输出用户输入的内容。
                        </div>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-label">匹配模式：</div>
                    <div class="form-control">
                        <input type="text" id="editMatchPattern" value="${escapeHtml(item.matchPattern || '')}" placeholder="如：信息：">
                        <div style="font-size: 12px; color: #e65100; margin-top: 6px; padding: 6px 8px; background: #fff3e0; border-radius: 4px;">
                            💡 <strong>说明：</strong>用于从编辑器中识别已有的信息行。打开工具时，匹配此模式的行将被提取为条目列表。
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="form-section" id="directOutputSection" ${item.type === 'direct' ? '' : 'style="display: none;"'}>
            <div class="form-section-title">直接插入内容</div>
            <div class="form-row">
                <div class="form-label">输出内容：</div>
                <div class="form-control">
                    <textarea id="editDirectOutput" placeholder="直接插入的脚本内容">${escapeHtml(item.output || '')}</textarea>
                </div>
            </div>
        </div>

        <div class="form-section" id="modalConfigSection" ${item.type === 'modal' ? '' : 'style="display: none;"'}>
            <div class="form-section-title">弹窗配置</div>
            <div class="form-row">
                <div class="form-label">窗口标题：</div>
                <div class="form-control">
                    <input type="text" id="editModalTitle" value="${escapeHtml(item.modal?.title || '')}" placeholder="如：添加角色对话">
                </div>
            </div>
            <div class="form-row">
                <div class="form-label">描述说明：</div>
                <div class="form-control">
                    <div class="rich-text-editor" id="descRichEditor">
                        <div class="rich-text-toolbar">
                            <button type="button" onclick="execRichCmd('bold')" title="加粗"><b>B</b></button>
                            <button type="button" onclick="execRichCmd('underline')" title="下划线"><u>U</u></button>
                            <div class="toolbar-separator"></div>
                            <button type="button" onclick="insertImageLink()" title="图片链接">🖼️</button>
                            <button type="button" onclick="insertAudioLink()" title="音频链接">🔊</button>
                            <button type="button" onclick="showLinkModal()" title="超链接">🔗</button>
                        </div>
                        <div class="rich-text-content" id="editModalDesc" contenteditable="true" data-placeholder="可选的描述说明，支持富文本格式">${convertAudioToPlaceholder(item.modal?.description || '')}</div>
                    </div>
                </div>
            </div>
            <div class="form-row">
                <div class="form-label">输出模板：</div>
                <div class="form-control">
                    <textarea id="editModalOutput" placeholder="使用 {1}、{2} 等作为占位符">${escapeHtml(item.modal?.output || '')}</textarea>
                </div>
            </div>
            ${renderPlaceholderHints(item.modal?.fields || [])}

            <div class="form-section" style="margin-top: 25px;">
                <div class="form-section-title">表单字段</div>
                <div id="fieldsContainer" class="fields-list">
                    ${renderFields(item.modal?.fields || [])}
                </div>
                <button class="add-field-btn" onclick="addField()">+ 添加字段</button>
            </div>
        </div>
        </div>

        <div class="form-actions">
            <button class="btn btn-danger" onclick="deleteItem(${catIndex}, ${itemIndex})">删除选项</button>
            <button class="btn btn-secondary" onclick="clearSelection()">取消</button>
            <button class="btn btn-primary" onclick="saveItem(${catIndex}, ${itemIndex})">保存修改</button>
        </div>
    `;
}

/* 渲染占位符对照表 */
function renderPlaceholderHints(fields) {
    if (!fields || fields.length === 0) {
        return '';
    }

    let html = '<div class="placeholder-hints"><div class="placeholder-hints-title">📌 占位符对照：</div><div class="placeholder-hints-list">';
    let phIndex = 0;
    fields.forEach((field) => {
        if (field.fieldCategory !== 'optional') {
            phIndex++;
            html += `<span class="placeholder-hint"><code class="placeholder-code">{${phIndex}}</code> → ${escapeHtml(field.name)} <span style="color:#1565c0;font-size:11px;">(必填)</span></span>`;
        }
    });
    fields.forEach((field) => {
        if (field.fieldCategory === 'optional') {
            phIndex++;
            const tmpl = field.outputTemplate || '';
            html += `<span class="placeholder-hint"><code class="placeholder-code">{${phIndex}}</code> → ${escapeHtml(field.name)} <span style="color:#e65100;font-size:11px;">(选填)</span>${tmpl ? `<span style="color:#888;font-size:11px;"> → ${escapeHtml(tmpl)}</span>` : ''}</span>`;
        }
    });
    html += '</div></div>';
    return html;
}

/* 字段拖拽开始 */
function handleFieldDragStart(event, index) {
    draggedFieldIndex = index;
    const item = config.categories[currentCategoryIndex].items[currentItemIndex];
    draggedFieldCategory = item.modal.fields[index].fieldCategory === 'optional' ? 'optional' : 'required';
    event.target.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
}

/* 字段拖拽结束 */
function handleFieldDragEnd() {
    draggedFieldIndex = -1;
    draggedFieldCategory = null;
    document.querySelectorAll('.field-item').forEach(el => el.classList.remove('dragging', 'drag-over'));
    document.querySelectorAll('.category-body').forEach(el => el.classList.remove('drag-over'));
}

/* 字段拖拽：在字段项上悬停 */
function handleFieldItemDragOver(event, index) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const items = document.querySelectorAll('.field-item');
    items.forEach((item, idx) => {
        if (idx === index) item.classList.add('drag-over');
    });
}

/* 字段拖拽：离开字段项 */
function handleFieldItemDragLeave() {
    document.querySelectorAll('.field-item').forEach(el => el.classList.remove('drag-over'));
}

/* 字段拖拽：放入指定字段位置（排序） */
function handleFieldItemDrop(event, index) {
    event.preventDefault();
    if (draggedFieldIndex === -1) return;
    const item = config.categories[currentCategoryIndex].items[currentItemIndex];
    const fields = item.modal.fields;
    if (draggedFieldIndex === index) {
        handleFieldDragEnd();
        return;
    }
    const movedField = fields.splice(draggedFieldIndex, 1)[0];
    /* 目标索引调整：被拖字段删除后后续元素前移一位，若拖放位置在原位置之后则索引减 1 */
    const targetIndex = draggedFieldIndex < index ? index - 1 : index;
    fields.splice(targetIndex, 0, movedField);
    handleFieldDragEnd();
    showItemEditor(currentCategoryIndex, currentItemIndex);
    showSuccess('字段顺序已调整');
}

/* 字段拖拽：区域悬停 */
function handleFieldZoneDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    event.currentTarget.classList.add('drag-over');
}

function handleFieldZoneDragLeave() {
    document.querySelectorAll('.category-body').forEach(el => el.classList.remove('drag-over'));
}

/* 字段拖拽：放入必填/选填区域 */
function handleFieldZoneDrop(event, targetCategory) {
    event.preventDefault();
    if (draggedFieldIndex === -1) return;
    const item = config.categories[currentCategoryIndex].items[currentItemIndex];
    const fields = item.modal.fields;
    const field = fields[draggedFieldIndex];
    const currentCategory = field.fieldCategory === 'optional' ? 'optional' : 'required';
    if (currentCategory === targetCategory) {
        handleFieldDragEnd();
        return;
    }
    if (targetCategory === 'optional') {
        field.fieldCategory = 'optional';
        if (!field.outputTemplate) {
            field.outputTemplate = '';
        }
    } else {
        delete field.fieldCategory;
        delete field.outputTemplate;
    }
    handleFieldDragEnd();
    showItemEditor(currentCategoryIndex, currentItemIndex);
    const msg = targetCategory === 'optional' ? '字段已设为选填' : '字段已设为必填';
    showSuccess(msg);
}

/* 获取字段类型的中文名 */
function getFieldTypeName(type) {
    const types = {
        text: '文本',
        number: '数字',
        date: '日期',
        dropdown: '下拉',
        dropdown_custom: '可编辑下拉',
        selectable: '可编辑下拉',
        checkbox: '复选框',
        image: '图片',
        audio: '音频',
        item_list: '条目列表'
    };
    return types[type] || type;
}

/* 切换多行编辑配置区域显示 */
function toggleMultiLineConfig() {
    const checkbox = document.getElementById('editMultiLineEdit');
    const config = document.getElementById('multiLineEditConfig');
    if (checkbox && config) {
        config.style.display = checkbox.checked ? 'block' : 'none';
    }
}

/* 切换选项类型（弹窗/直接）输入区域 */
function toggleItemTypeFields() {
    const type = document.getElementById('editItemType').value;
    const directSection = document.getElementById('directOutputSection');
    const modalSection = document.getElementById('modalConfigSection');
    
    const item = config.categories[currentCategoryIndex].items[currentItemIndex];
    item.type = type;
    
    if (type === 'direct') {
        directSection.style.display = 'block';
        modalSection.style.display = 'none';
        if (!item.output) item.output = '';
    } else {
        directSection.style.display = 'none';
        modalSection.style.display = 'block';
        if (!item.modal) {
            item.modal = {
                title: '',
                description: '',
                fields: [],
                output: ''
            };
        }
    }
    
    renderCategories();
}

/* 显示添加/编辑选项模态框 */
function showAddItem(catIndex, itemIndex = -1) {
    currentCategoryIndex = catIndex;
    currentItemIndex = itemIndex;
    
    if (itemIndex === -1) {
        const newItem = {
            name: '',
            icon: '',
            type: 'modal',
            shortcut: '',
            modal: {
                title: '',
                description: '',
                fields: [],
                output: ''
            }
        };
        config.categories[catIndex].items.push(newItem);
        currentItemIndex = config.categories[catIndex].items.length - 1;
    }
    
    renderCategories();
    showItemEditor(catIndex, currentItemIndex);
}

/* 保存选项修改 */
function saveItem(catIndex, itemIndex) {
    const item = config.categories[catIndex].items[itemIndex];
    const type = document.getElementById('editItemType').value;
    
    item.name = document.getElementById('editItemName').value.trim();
    item.icon = document.getElementById('editItemIcon').value.trim();
    item.type = type;
    item.shortcut = document.getElementById('editItemShortcut').value.trim();
    
    const tooltipCb = document.getElementById('editItemTooltipEnabled');
    if (tooltipCb && !tooltipCb.checked) {
        item.tooltipEnabled = false;
    } else {
        delete item.tooltipEnabled;
    }

    const inlineInsertCb = document.getElementById('editInlineInsert');
    if (inlineInsertCb && inlineInsertCb.checked) {
        item.inlineInsert = true;
    } else {
        delete item.inlineInsert;
    }

    const multiLineCb = document.getElementById('editMultiLineEdit');
    if (multiLineCb && multiLineCb.checked) {
        item.multiLineEdit = true;
        item.lineTemplate = document.getElementById('editLineTemplate').value.trim();
        item.matchPattern = document.getElementById('editMatchPattern').value.trim();
    } else {
        delete item.multiLineEdit;
        delete item.lineTemplate;
        delete item.matchPattern;
    }

    const descContent = document.getElementById('editModalDesc');
    const descHtml = convertPlaceholderToAudio(descContent ? descContent.innerHTML : '');
    
    if (type === 'direct') {
        item.output = document.getElementById('editDirectOutput').value;
        if (item.modal) {
            item.modal.title = document.getElementById('editModalTitle')?.value?.trim() || item.modal.title;
            item.modal.description = descHtml;
            item.modal.output = document.getElementById('editModalOutput')?.value || item.modal.output;
        }
    } else {
        if (!item.modal) {
            item.modal = {
                title: '',
                description: '',
                fields: [],
                output: ''
            };
        }
        item.modal.title = document.getElementById('editModalTitle').value.trim();
        item.modal.description = descHtml;
        item.modal.output = document.getElementById('editModalOutput').value;
    }
    
    if (!item.name) {
        showError('请输入选项名称');
        return;
    }
    
    renderCategories();
    showSuccess('选项保存成功！');
}

/* 删除选项 */
function deleteItem(catIndex, itemIndex) {
    if (!confirm('确定要删除这个选项吗？')) return;
    
    config.categories[catIndex].items.splice(itemIndex, 1);
    currentItemIndex = -1;
    renderCategories();
    document.getElementById('editorPanel').innerHTML = `
        <div class="editor-placeholder">
            <p>👈 请从左侧选择一个选项进行编辑</p>
            <p>或者点击某个分类下的「+」添加新选项</p>
        </div>
    `;
    showSuccess('选项已删除');
}

/* 清空选中状态 */
function clearSelection() {
    currentItemIndex = -1;
    renderCategories();
    document.getElementById('editorPanel').innerHTML = `
        <div class="editor-placeholder">
            <p>👈 请从左侧选择一个选项进行编辑</p>
            <p>或者点击某个分类下的「+」添加新选项</p>
        </div>
    `;
}

/* 添加字段弹窗 */
function addField() {
    editingFieldIndex = -1;
    document.getElementById('fieldModalTitle').textContent = '添加字段';
    document.getElementById('fieldNameInput').value = '';
    document.getElementById('fieldTypeInput').value = 'text';
    document.getElementById('fieldPlaceholderInput').value = '';
    document.getElementById('fieldOptionsInput').value = '';
    document.getElementById('fieldStepInput').value = 'any';
    document.getElementById('fieldRequiredInput').checked = false;
    document.getElementById('fieldCategoryInput').value = 'required';
    document.getElementById('fieldOutputTemplateInput').value = '';
    document.getElementById('fieldOutputTemplateGroup').style.display = 'none';
    document.getElementById('fieldDefaultValueInput').value = '';
    /* 重置条目列表配置 */
    window._subFieldData = [];
    renderSubFields();
    document.getElementById('fieldItemTemplateInput').value = '';
    document.getElementById('fieldBlockPrefixInput').value = '';
    document.getElementById('fieldBlockSuffixInput').value = '';
    toggleFieldOptions();
    document.getElementById('fieldModal').classList.add('show');
}

/* 编辑字段弹窗 */
function editField(index) {
    editingFieldIndex = index;
    const item = config.categories[currentCategoryIndex].items[currentItemIndex];
    const field = item.modal.fields[index];
    
    document.getElementById('fieldModalTitle').textContent = '编辑字段';
    document.getElementById('fieldNameInput').value = field.name;
    document.getElementById('fieldTypeInput').value = field.type;
    document.getElementById('fieldPlaceholderInput').value = field.placeholder || '';
    document.getElementById('fieldOptionsInput').value = field.options || '';
    document.getElementById('fieldStepInput').value = field.step || 'any';
    document.getElementById('fieldRequiredInput').checked = field.required || false;
    document.getElementById('fieldCategoryInput').value = field.fieldCategory === 'optional' ? 'optional' : 'required';
    document.getElementById('fieldOutputTemplateInput').value = field.outputTemplate || '';
    document.getElementById('fieldOutputTemplateGroup').style.display = field.fieldCategory === 'optional' ? 'flex' : 'none';
    document.getElementById('fieldDefaultValueInput').value = field.defaultValue || '';
    /* 还原条目列表配置 */
    if (field.type === 'item_list') {
        window._subFieldData = field.subFields ? JSON.parse(JSON.stringify(field.subFields)) : [];
        document.getElementById('fieldItemTemplateInput').value = field.itemTemplate || '';
        document.getElementById('fieldBlockPrefixInput').value = field.blockPrefix || '';
        document.getElementById('fieldBlockSuffixInput').value = field.blockSuffix || '';
    } else {
        window._subFieldData = [];
        document.getElementById('fieldItemTemplateInput').value = '';
        document.getElementById('fieldBlockPrefixInput').value = '';
        document.getElementById('fieldBlockSuffixInput').value = '';
    }
    renderSubFields();
    toggleFieldOptions();
    document.getElementById('fieldModal').classList.add('show');
}

/* 删除字段 */
function removeField(index) {
    const item = config.categories[currentCategoryIndex].items[currentItemIndex];
    item.modal.fields.splice(index, 1);
    showItemEditor(currentCategoryIndex, currentItemIndex);
    showSuccess('字段已删除');
}

/* 关闭字段编辑弹窗 */
function closeFieldModal() {
    document.getElementById('fieldModal').classList.remove('show');
}

/* ==== 子字段管理（条目列表专用） ==== */

/* 渲染子字段列表 */
function renderSubFields() {
    const container = document.getElementById('subFieldsList');
    const data = window._subFieldData || [];
    
    if (data.length === 0) {
        container.innerHTML = '<div class="empty-hint">暂无子字段，请点击下方按钮添加</div>';
        return;
    }
    
    let html = '';
    data.forEach((subField, index) => {
        const typeName = {
            text: '文本',
            number: '数字',
            dropdown: '下拉',
            dropdown_custom: '可编辑下拉',
            checkbox: '复选框',
            date: '日期'
        }[subField.type] || subField.type;
        html += `
            <div class="field-item" style="margin-bottom: 6px;">
                <div class="field-info">
                    <div class="field-header">
                        <div class="field-name">${escapeHtml(subField.name)}${subField.required ? '<span style="color:#d32f2f;margin-left:4px;">*</span>' : ''}</div>
                        <span class="field-type">${typeName}</span>
                    </div>
                    ${subField.defaultValue ? `<div style="font-size:11px;color:#888;margin-top:2px;">默认: ${escapeHtml(subField.defaultValue)}</div>` : ''}
                    ${subField.required ? '<div style="font-size:11px;color:#d32f2f;margin-top:2px;">必填</div>' : ''}
                </div>
                <div class="field-actions">
                    <button onclick="editSubField(${index})">编辑</button>
                    <button onclick="removeSubField(${index})">删除</button>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

/* 添加子字段弹窗 */
function addSubField() {
    window._editingSubFieldIndex = -1;
    document.getElementById('subFieldModalTitle').textContent = '添加子字段';
    document.getElementById('subFieldNameInput').value = '';
    document.getElementById('subFieldTypeInput').value = 'text';
    document.getElementById('subFieldPlaceholderInput').value = '';
    document.getElementById('subFieldOptionsInput').value = '';
    document.getElementById('subFieldDefaultInput').value = '';
    document.getElementById('subFieldRequiredInput').checked = false;
    document.getElementById('subFieldCheckedValue').value = 'true';
    document.getElementById('subFieldUncheckedValue').value = 'false';
    toggleSubFieldOptions();
    document.getElementById('subFieldModal').classList.add('show');
}

/* 编辑子字段弹窗 */
function editSubField(index) {
    window._editingSubFieldIndex = index;
    const data = window._subFieldData || [];
    const subField = data[index];
    if (!subField) return;
    
    document.getElementById('subFieldModalTitle').textContent = '编辑子字段';
    document.getElementById('subFieldNameInput').value = subField.name;
    document.getElementById('subFieldTypeInput').value = subField.type;
    document.getElementById('subFieldPlaceholderInput').value = subField.placeholder || '';
    document.getElementById('subFieldOptionsInput').value = subField.options || '';
    document.getElementById('subFieldDefaultInput').value = subField.defaultValue || '';
    document.getElementById('subFieldRequiredInput').checked = subField.required || false;
    document.getElementById('subFieldCheckedValue').value = subField.checkedValue || 'true';
    document.getElementById('subFieldUncheckedValue').value = subField.uncheckedValue || 'false';
    toggleSubFieldOptions();
    document.getElementById('subFieldModal').classList.add('show');
}

/* 提交子字段 */
function submitSubFieldModal() {
    const name = document.getElementById('subFieldNameInput').value.trim();
    const type = document.getElementById('subFieldTypeInput').value;
    const placeholder = document.getElementById('subFieldPlaceholderInput').value.trim();
    const options = document.getElementById('subFieldOptionsInput').value.trim();
    const defaultValue = document.getElementById('subFieldDefaultInput').value.trim();
    
    if (!name) {
        showError('请输入子字段名称');
        return;
    }
    
    if ((type === 'dropdown' || type === 'dropdown_custom') && !options) {
        if (type === 'dropdown') {
            showError('下拉选择类型必须填写选项');
            return;
        }
        /* dropdown_custom/selectable 不强制要求选项 */
    }
    
    const required = document.getElementById('subFieldRequiredInput').checked;
    const checkedValue = document.getElementById('subFieldCheckedValue').value.trim();
    const uncheckedValue = document.getElementById('subFieldUncheckedValue').value.trim();
    
    const subField = { name, type };
    if (placeholder) subField.placeholder = placeholder;
    if (options) subField.options = options;
    if (defaultValue) subField.defaultValue = defaultValue;
    if (required) subField.required = true;
    if (type === 'checkbox') {
        subField.checkedValue = checkedValue || 'true';
        subField.uncheckedValue = uncheckedValue || 'false';
    }
    
    if (!window._subFieldData) window._subFieldData = [];
    
    const editIndex = window._editingSubFieldIndex;
    if (editIndex === -1) {
        window._subFieldData.push(subField);
    } else {
        window._subFieldData[editIndex] = subField;
    }
    
    closeSubFieldModal();
    renderSubFields();
}

/* 删除子字段 */
function removeSubField(index) {
    if (!window._subFieldData) return;
    if (!confirm('确定要删除这个子字段吗？')) return;
    window._subFieldData.splice(index, 1);
    renderSubFields();
}

/* 关闭子字段弹窗 */
function closeSubFieldModal() {
    document.getElementById('subFieldModal').classList.remove('show');
}

/* 切换子字段选项显示 */
function toggleSubFieldOptions() {
    const type = document.getElementById('subFieldTypeInput').value;
    document.getElementById('subFieldOptionsGroup').style.display = (type === 'dropdown' || type === 'dropdown_custom') ? 'flex' : 'none';
    document.getElementById('subFieldCheckboxGroup').style.display = type === 'checkbox' ? 'flex' : 'none';
    document.getElementById('subFieldUncheckedGroup').style.display = type === 'checkbox' ? 'flex' : 'none';
}

/* 切换字段类型选项（下拉框/数字步长/复选框/条目列表等） */
function toggleFieldOptions() {
    const type = document.getElementById('fieldTypeInput').value;
    document.getElementById('fieldOptionsGroup').style.display = (type === 'dropdown' || type === 'selectable' || type === 'dropdown_custom') ? 'flex' : 'none';
    document.getElementById('fieldStepGroup').style.display = type === 'number' ? 'flex' : 'none';
    document.getElementById('fieldCheckboxGroup').style.display = type === 'checkbox' ? 'flex' : 'none';
    document.getElementById('fieldUncheckedGroup').style.display = type === 'checkbox' ? 'flex' : 'none';
    document.getElementById('itemListConfigGroup').style.display = type === 'item_list' ? 'block' : 'none';
    /* 条目列表不使用脚本分类/选填输出/默认值，隐藏这些字段 */
    const fieldRows = document.querySelectorAll('#fieldModal .form-row');
    fieldRows.forEach(row => {
        const label = row.querySelector('.form-label');
        if (label && (label.textContent.includes('脚本分类') || label.textContent.includes('选填输出') || label.textContent.includes('默认值'))) {
            row.style.display = type === 'item_list' ? 'none' : '';
        }
    });
}

/* 切换字段类别显示输出模板区域 */
function toggleFieldCategory() {
    const category = document.getElementById('fieldCategoryInput').value;
    document.getElementById('fieldOutputTemplateGroup').style.display = category === 'optional' ? 'flex' : 'none';
}

/* 提交字段编辑模态框 */
function submitFieldModal() {
    const name = document.getElementById('fieldNameInput').value.trim();
    const type = document.getElementById('fieldTypeInput').value;
    const placeholder = document.getElementById('fieldPlaceholderInput').value.trim();
    const options = document.getElementById('fieldOptionsInput').value.trim();
    const step = document.getElementById('fieldStepInput').value.trim();
    const checkedValue = document.getElementById('fieldCheckedValue').value.trim();
    const uncheckedValue = document.getElementById('fieldUncheckedValue').value.trim();
    const required = document.getElementById('fieldRequiredInput').checked;
    const fieldCategory = document.getElementById('fieldCategoryInput').value;
    const outputTemplate = document.getElementById('fieldOutputTemplateInput').value.trim();
    const defaultValue = document.getElementById('fieldDefaultValueInput').value.trim();
    /* 条目列表专用数据 */
    const subFieldCount = window._subFieldData ? window._subFieldData.length : 0;
    const itemTemplate = document.getElementById('fieldItemTemplateInput').value.trim();
    const blockPrefix = document.getElementById('fieldBlockPrefixInput').value.trim();
    const blockSuffix = document.getElementById('fieldBlockSuffixInput').value.trim();
    
    if (!name) {
        showError('请输入字段名称');
        return;
    }
    
    if (type === 'item_list') {
        if (!window._subFieldData || window._subFieldData.length === 0) {
            showError('条目列表必须至少定义一个子字段');
            return;
        }
        if (!itemTemplate) {
            showError('条目列表必须指定条目模板');
            return;
        }
    }
    
    if (fieldCategory === 'optional' && !outputTemplate) {
        showError('脚本可选字段必须指定输出模板');
        return;
    }
    
    const field = {
        name,
        type,
        placeholder
    };
    
    if (type === 'item_list') {
        field.subFields = JSON.parse(JSON.stringify(window._subFieldData || []));
        field.itemTemplate = itemTemplate;
        if (blockPrefix) field.blockPrefix = blockPrefix;
        if (blockSuffix) field.blockSuffix = blockSuffix;
    } else {
        if (defaultValue) field.defaultValue = defaultValue;
        if (options) field.options = options;
        if (step) field.step = step;
        if (type === 'checkbox') {
            field.checkedValue = checkedValue || 'true';
            field.uncheckedValue = uncheckedValue || 'false';
        }
        if (fieldCategory === 'optional') {
            field.fieldCategory = 'optional';
            field.outputTemplate = outputTemplate;
        }
    }
    if (required) field.required = true;
    
    const item = config.categories[currentCategoryIndex].items[currentItemIndex];
    
    if (!item.modal) {
        item.modal = {
            title: '',
            description: '',
            fields: [],
            output: ''
        };
    } else if (!item.modal.fields) {
        item.modal.fields = [];
    }
    
    if (editingFieldIndex === -1) {
        item.modal.fields.push(field);
    } else {
        item.modal.fields[editingFieldIndex] = field;
    }
    
    closeFieldModal();
    showItemEditor(currentCategoryIndex, currentItemIndex);
    showSuccess(editingFieldIndex === -1 ? '字段添加成功' : '字段修改成功');
}

/* 显示添加分类弹窗 */
function showAddCategoryModal() {
    editingCategoryIndex = -1;
    document.getElementById('categoryModalTitle').textContent = '添加分类';
    document.getElementById('categoryNameInput').value = '';
    document.getElementById('categoryModal').classList.add('show');
}

/* 编辑分类 */
function editCategory(index) {
    editingCategoryIndex = index;
    document.getElementById('categoryModalTitle').textContent = '编辑分类';
    document.getElementById('categoryNameInput').value = config.categories[index].name;
    document.getElementById('categoryModal').classList.add('show');
}

/* 关闭分类编辑弹窗 */
function closeCategoryModal() {
    document.getElementById('categoryModal').classList.remove('show');
}

function submitCategoryModal() {
    const name = document.getElementById('categoryNameInput').value.trim();
    if (!name) {
        showError('请输入分类名称');
        return;
    }

    if (editingCategoryIndex === -1) {
        config.categories.push({ name, items: [] });
        showSuccess('分类添加成功');
    } else {
        config.categories[editingCategoryIndex].name = name;
        showSuccess('分类修改成功');
    }
    
    closeCategoryModal();
    renderCategories();
}

/* 删除分类 */
function deleteCategory(index) {
    if (!confirm('确定要删除这个分类及其所有选项吗？')) return;
    
    config.categories.splice(index, 1);
    currentCategoryIndex = -1;
    currentItemIndex = -1;
    renderCategories();
    document.getElementById('editorPanel').innerHTML = `
        <div class="editor-placeholder">
            <p>👈 请从左侧选择一个选项进行编辑</p>
            <p>或者点击「+ 添加分类」创建新的分类</p>
        </div>
    `;
    showSuccess('分类已删除');
}

function showSuccess(message) {
    const el = document.getElementById('successMessage');
    el.textContent = message;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 3000);
}

function showError(message) {
    const el = document.getElementById('errorMessage');
    el.textContent = message;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 3000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/* 将 description 中的音频标签转换为占位符（用于编辑器渲染） */
function convertAudioToPlaceholder(html) {
    if (!html) return '';
    return html.replace(/<audio\s+[^>]*src="([^"]+)"[^>]*>[\s\S]*?<\/audio>/gi, 
        '<span class="audio-placeholder" contenteditable="false" data-src="$1">🔊 音频</span>');
}

/* 将占位符转换回音频标签（用于保存） */
function convertPlaceholderToAudio(html) {
    if (!html) return '';
    return html.replace(/<span\s+class="audio-placeholder"\s+data-src="([^"]+)">[^<]*<\/span>/gi, 
        '<audio src="$1" controls="">');
}

function goBack() {
    window.location.href = 'index.html';
}

init();
