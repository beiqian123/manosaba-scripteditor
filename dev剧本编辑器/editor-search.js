/* --- 搜索替换功能 ---
 *   searchText, nextMatch, prevMatch, jumpToMatch 搜索与导航
 *   clearSearch, escapeRegExp 清除搜索与正则转义
 *   findAllMatches, doReplaceAll 通用查找/替换工具
 *   replaceCurrent, replaceAll 当前/全部替换
 *   openReplaceModal, replaceCurrentInModal, replaceAllInModal 替换弹窗
 *   依赖: utils.js (editor 全局变量, getEditorValue, setEditorValue 等) */

/* --- 命令面板 ---
 *   handleSearchInput, showSearchDropdown, hideSearchDropdown
 *   在搜索框输入时同时搜索工具（支持拼音）和剧本内容 */

let searchDropdownItems = [];
let searchDropdownSelectedIndex = -1;

/* 搜索输入框按键处理（Enter 下一个，Shift+Enter 上一个，箭头导航下拉） */
function handleSearchKeydown(event) {
    const dropdown = document.getElementById('searchDropdown');
    const isOpen = dropdown && dropdown.style.display !== 'none';
    
    if (event.key === 'ArrowDown' && isOpen) {
        event.preventDefault();
        navigateSearchDropdown(1);
        return;
    }
    if (event.key === 'ArrowUp' && isOpen) {
        event.preventDefault();
        navigateSearchDropdown(-1);
        return;
    }
    if (event.key === 'Enter') {
        event.preventDefault();
        if (isOpen && searchDropdownSelectedIndex >= 0 && searchDropdownSelectedIndex < searchDropdownItems.length) {
            const item = searchDropdownItems[searchDropdownSelectedIndex];
            executeSearchDropdownItem(item);
            return;
        }
        if (event.shiftKey) {
            prevMatch();
        } else {
            nextMatch();
        }
        return;
    }
    if (event.key === 'Escape') {
        hideSearchDropdown();
        clearSearch();
        return;
    }
}

/* 导航下拉面板 */
function navigateSearchDropdown(direction) {
    if (searchDropdownItems.length === 0) return;
    const oldIdx = searchDropdownSelectedIndex;
    searchDropdownSelectedIndex = Math.max(0, Math.min(searchDropdownItems.length - 1, searchDropdownSelectedIndex + direction));
    
    const allItems = document.querySelectorAll('#searchDropdown .search-dropdown-item');
    allItems.forEach((el, i) => {
        el.classList.toggle('selected', i === searchDropdownSelectedIndex);
    });
    
    /* 滚动到选中项 */
    if (searchDropdownSelectedIndex >= 0) {
        const selectedEl = allItems[searchDropdownSelectedIndex];
        if (selectedEl) {
            selectedEl.scrollIntoView({ block: 'nearest' });
        }
    }
}

/* 执行下拉面板选中项 */
function executeSearchDropdownItem(item) {
    hideSearchDropdown();
    if (item.type === 'tool') {
        openToolModal(item.item);
    } else if (item.type === 'script') {
        /* 搜剧本：跳转到对应行 */
        const match = item.match;
        const text = getEditorValue();
        const lines = text.substring(0, match.start).split('\n');
        const lineNumber = lines.length;
        const lineHeight = 21;
        const targetScrollTop = (lineNumber - 3) * lineHeight;
        scrollEditorTo(Math.max(0, targetScrollTop));
        focusEditor();
        setEditorSelectionRange(match.start, match.end);
        
        /* 更新搜索匹配显示 */
        searchMatches = findAllMatches(document.getElementById('searchInput').value.trim());
        if (searchMatches.length > 0) {
            currentMatchIndex = searchMatches.indexOf(match);
            if (currentMatchIndex === -1) currentMatchIndex = 0;
            document.getElementById('searchCount').textContent = `${currentMatchIndex + 1}/${searchMatches.length}`;
            document.getElementById('searchCount').style.color = '#6a1b9a';
            if (editor && editor.getWrapperElement) editor.getWrapperElement().classList.add('highlight');
        }
    }
}

/* 打开工具弹窗 */
function openToolModal(item) {
    if (item.type === 'direct') {
        /* 直接插入 */
        insertSnippet(item.output);
        showSuccess('已插入: ' + item.name);
        return;
    }
    if (item.type === 'modal' && typeof openDynamicModal === 'function') {
        openDynamicModal(item.name);
        return;
    }
}

/* 搜索框输入处理 */
function handleSearchInput(event) {
    const query = event.target.value.trim();
    if (query.length < 1) {
        hideSearchDropdown();
        return;
    }
    
    /* 清除旧的高亮搜索标记 */
    if (editor && editor.getWrapperElement) editor.getWrapperElement().classList.remove('highlight');
    document.getElementById('searchCount').textContent = '';
    
    showSearchDropdown(query);
}

/* 匹配工具名（支持拼音首字母） */
function matchToolByName(toolName, query) {
    const lower = toolName.toLowerCase();
    const q = query.toLowerCase();
    if (lower.includes(q)) return true;
    
    /* 拼音首字母匹配 */
    try {
        if (typeof getPinyinInitials === 'function') {
            const initials = getPinyinInitials(toolName);
            if (initials && initials.includes(q)) return true;
        }
    } catch (e) {}
    return false;
}

/* 搜索工具 */
function searchTools(query) {
    if (!toolsConfig || !toolsConfig.categories || !toolsConfig.categories.length) return [];
    
    const results = [];
    const isCommandSearch = query.startsWith('@');
    const searchQuery = isCommandSearch ? query.substring(1).toLowerCase() : query.toLowerCase();
    
    for (const category of toolsConfig.categories) {
        if (!category.items) continue;
        for (const item of category.items) {
            if (!item.name) continue;
            
            if (isCommandSearch) {
                /* @前缀搜索：匹配命令输出 */
                const output = item.output || '';
                const modalOutput = (item.modal && item.modal.output) || '';
                const combined = (output + ' ' + modalOutput).toLowerCase();
                if (combined.includes('@' + searchQuery) || combined.includes(searchQuery)) {
                    results.push({ item, category: category.name, score: 10 });
                }
            } else {
                /* 普通搜索：匹配工具名或分类名（含拼音） */
                const matchedName = matchToolByName(item.name, query);
                const matchedCategory = matchToolByName(category.name, query);
                if (matchedName || matchedCategory) {
                    let score = 0;
                    if (item.name.toLowerCase().includes(searchQuery)) score += 5;
                    else if (matchedName) score += 3;
                    if (category.name.toLowerCase().includes(searchQuery)) score += 2;
                    else if (matchedCategory) score += 1;
                    results.push({ item, category: category.name, score });
                }
            }
        }
    }
    
    /* 按分数排序取前 8 */
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 8);
}

/* 搜剧本（取前 6 个匹配行） */
function searchScriptInDropdown(query) {
    if (query.startsWith('@')) return []; /* @ 前缀不搜剧本 */
    try {
        const allMatches = findAllMatches(query);
        if (allMatches.length === 0) return [];
        
        /* 去重：同一个行只保留一个匹配 */
        const text = getEditorValue();
        const lines = text.split('\n');
        const lineMatches = new Map();
        
        allMatches.forEach(m => {
            const lineNum = text.substring(0, m.start).split('\n').length - 1;
            if (lineNum >= 0 && lineNum < lines.length && !lineMatches.has(lineNum)) {
                lineMatches.set(lineNum, {
                    match: m,
                    lineNum: lineNum,
                    lineText: lines[lineNum].trim()
                });
            }
        });
        
        return Array.from(lineMatches.values()).slice(0, 6);
    } catch (e) {
        return [];
    }
}

/* 显示搜索下拉面板 */
function showSearchDropdown(query) {
    const dropdown = document.getElementById('searchDropdown');
    if (!dropdown) return;
    
    const toolResults = searchTools(query);
    /* 短查询时提示用户，而非直接跳过 */
    let scriptResults = [];
    let shortQueryHint = false;
    if (query.length < 2) {
        shortQueryHint = true;
    } else {
        scriptResults = searchScriptInDropdown(query);
    }
    
    if (toolResults.length === 0 && scriptResults.length === 0) {
        dropdown.innerHTML = '<div class="search-dropdown-empty">无匹配结果</div>';
        dropdown.style.display = 'block';
        searchDropdownItems = [];
        searchDropdownSelectedIndex = -1;
        return;
    }
    
    let html = '';
    searchDropdownItems = [];
    
    /* 工具匹配部分 */
    if (toolResults.length > 0) {
        html += '<div class="search-dropdown-section">';
        html += '<div class="search-dropdown-section-title">🔧 工具匹配 (' + toolResults.length + ')</div>';
        toolResults.forEach((r, idx) => {
            const icon = r.item.icon || '📋';
            const name = r.item.name;
            const category = r.category;
            html += '<div class="search-dropdown-item" data-idx="' + idx + '" onclick="executeSearchDropdownItem(searchDropdownItems[' + searchDropdownItems.length + '])">';
            html += '<span class="sdi-icon">' + escapeHtml(icon) + '</span>';
            html += '<span class="sdi-name">' + escapeHtml(name) + '</span>';
            html += '<span class="sdi-category">' + escapeHtml(category) + '</span>';
            html += '</div>';
            searchDropdownItems.push({ type: 'tool', item: r.item });
        });
        html += '</div>';
    }
    
    /* 剧本匹配部分 */
    if (shortQueryHint) {
        html += '<div class="search-dropdown-section">';
        html += '<div class="search-dropdown-section-title">📜 剧本匹配</div>';
        html += '<div class="search-dropdown-item search-dropdown-hint" onclick="hideSearchDropdown();document.getElementById(\'searchInput\').focus();searchText();">';
        html += '<span style="font-size:12px;">输入至少 2 个字符以搜索剧本内容，或<span style="color:#6a1b9a;font-weight:600;">点击此处 / 按回车</span>执行搜索</span>';
        html += '</div>';
        html += '</div>';
    } else if (scriptResults.length > 0) {
        html += '<div class="search-dropdown-section">';
        html += '<div class="search-dropdown-section-title">📜 剧本匹配 (' + scriptResults.length + ')</div>';
        scriptResults.forEach((sr, idx) => {
            const lineNum = sr.lineNum + 1;
            const lineText = sr.lineText.length > 60 ? sr.lineText.substring(0, 60) + '...' : sr.lineText;
            const globalItemIdx = searchDropdownItems.length;
            html += '<div class="search-dropdown-item" onclick="executeSearchDropdownItem(searchDropdownItems[' + globalItemIdx + '])">';
            html += '<span class="sdi-line">L' + lineNum + '</span>';
            html += '<span class="sdi-text">' + escapeHtml(lineText) + '</span>';
            html += '</div>';
            searchDropdownItems.push({ type: 'script', match: sr.match, lineNum: sr.lineNum });
        });
        html += '</div>';
    }
    
    dropdown.innerHTML = html;
    dropdown.style.display = 'block';
    searchDropdownSelectedIndex = -1;
    
    /* 自动选中第一项 */
    if (searchDropdownItems.length > 0) {
        searchDropdownSelectedIndex = 0;
        const firstItem = dropdown.querySelector('.search-dropdown-item');
        if (firstItem) firstItem.classList.add('selected');
    }
}

/* 隐藏搜索下拉面板 */
function hideSearchDropdown() {
    const dropdown = document.getElementById('searchDropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
    searchDropdownItems = [];
    searchDropdownSelectedIndex = -1;
}

/* 修改 clearSearch 同时隐藏下拉 */
function clearSearch() {
    hideSearchDropdown();
    searchMatches = [];
    currentMatchIndex = -1;
    document.getElementById('searchInput').value = '';
    document.getElementById('searchCount').textContent = '';
    if (editor && editor.getWrapperElement) editor.getWrapperElement().classList.remove('highlight');
    setEditorSelectionRange(0, 0);
    focusEditor();
}

/* 点击外部关闭搜索下拉面板 */
document.addEventListener('click', function(e) {
    const dropdown = document.getElementById('searchDropdown');
    const searchContainer = document.querySelector('.search-container');
    if (dropdown && dropdown.style.display !== 'none' && searchContainer) {
        if (!searchContainer.contains(e.target) && !dropdown.contains(e.target)) {
            hideSearchDropdown();
        }
    }
});

/* 执行搜索：查找全部匹配并定位到第一个 */
function searchText() {
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput.value.trim();

    if (!searchTerm) {
        clearSearch();
        return;
    }

    hideSearchDropdown();
    
    searchMatches = findAllMatches(searchTerm);

    const searchCount = document.getElementById('searchCount');

    if (searchMatches.length === 0) {
        searchCount.textContent = '无匹配';
        searchCount.style.color = '#d32f2f';
        currentMatchIndex = -1;
        if (editor && editor.getWrapperElement) editor.getWrapperElement().classList.remove('highlight');
    } else {
        currentMatchIndex = 0;
        searchCount.textContent = `1/${searchMatches.length}`;
        searchCount.style.color = '#6a1b9a';
        if (editor && editor.getWrapperElement) editor.getWrapperElement().classList.add('highlight');
        jumpToMatch(currentMatchIndex);
    }
}

/* 正则转义（保证搜索关键字安全） */
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* 查找全部匹配（通用，供搜索/替换复用） */
function findAllMatches(searchTerm) {
    const text = getEditorValue();
    const regex = new RegExp(escapeRegExp(searchTerm), 'gi');
    const matches = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
        matches.push({
            start: match.index,
            end: match.index + match[0].length,
            text: match[0]
        });
    }
    return matches;
}

/* 批量替换全部匹配（通用，处理 offset 偏移后一次写入） */
function doReplaceAll(matches, replaceTerm) {
    let newText = getEditorValue();
    let offset = 0;
    matches.forEach(m => {
        newText = newText.substring(0, m.start + offset) + replaceTerm + newText.substring(m.end + offset);
        offset += replaceTerm.length - m.text.length;
    });
    setEditorValue(newText);
}

/* 下一个匹配 */
function nextMatch() {
    if (searchMatches.length === 0) {
        searchText();
        return;
    }

    currentMatchIndex = (currentMatchIndex + 1) % searchMatches.length;
    document.getElementById('searchCount').textContent = `${currentMatchIndex + 1}/${searchMatches.length}`;
    jumpToMatch(currentMatchIndex);
}

/* 上一个匹配 */
function prevMatch() {
    if (searchMatches.length === 0) {
        searchText();
        return;
    }

    currentMatchIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    document.getElementById('searchCount').textContent = `${currentMatchIndex + 1}/${searchMatches.length}`;
    jumpToMatch(currentMatchIndex);
}

/* 跳转到指定索引的匹配位置 */
function jumpToMatch(index) {
    if (index < 0 || index >= searchMatches.length) return;

    const match = searchMatches[index];
    const text = getEditorValue();
    const lines = text.substring(0, match.start).split('\n');
    const lineNumber = lines.length;
    const lineHeight = 21;

    const targetScrollTop = (lineNumber - 3) * lineHeight;
    scrollEditorTo(Math.max(0, targetScrollTop));

    focusEditor();
    setEditorSelectionRange(match.start, match.end);
}

/* 替换输入框按键处理（Enter 替换当前，Shift+Enter 替换全部） */
function handleReplaceKeydown(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        if (event.shiftKey) {
            replaceAll();
        } else {
            replaceCurrent();
        }
    }
}

/* 替换当前选中匹配 */
function replaceCurrent() {
    const searchTerm = document.getElementById('searchInput').value.trim();
    const replaceTerm = document.getElementById('replaceInput').value;

    if (!searchTerm) {
        showError('请输入搜索内容');
        return;
    }

    if (searchMatches.length === 0) {
        searchText();
        return;
    }

    if (currentMatchIndex === -1) {
        showError('没有选中的匹配项');
        return;
    }

    const match = searchMatches[currentMatchIndex];
    const text = getEditorValue();

    setEditorValue(text.substring(0, match.start) + replaceTerm + text.substring(match.end));

    searchText();
    showSuccess('已替换 1 处');
}

/* 替换全部匹配项 */
function replaceAll() {
    const searchTerm = document.getElementById('searchInput').value.trim();
    const replaceTerm = document.getElementById('replaceInput').value;

    if (!searchTerm) {
        showError('请输入搜索内容');
        return;
    }

    const matches = findAllMatches(searchTerm);
    if (matches.length === 0) {
        showError('没有找到匹配项！');
        return;
    }

    if (!confirm(`确定要替换全部 ${matches.length} 处匹配项吗？`)) {
        return;
    }

    doReplaceAll(matches, replaceTerm);
    clearSearch();
    showSuccess(`已替换 ${matches.length} 处`);
}

/* 打开替换模态框 */
function openReplaceModal() {
    document.getElementById('replaceSearchInput').value = document.getElementById('searchInput').value;
    document.getElementById('replaceTargetInput').value = '';
    updateReplaceInfo();
    showModal('replaceModal');
}

/* 更新替换模态框中的匹配统计信息 */
function updateReplaceInfo() {
    const searchTerm = document.getElementById('replaceSearchInput').value;
    const replaceInfo = document.getElementById('replaceInfo');

    if (!searchTerm) {
        replaceInfo.innerHTML = '请输入搜索内容！';
        replaceInfo.className = 'replace-info';
        return;
    }

    const matches = findAllMatches(searchTerm);

    if (matches.length === 0) {
        replaceInfo.innerHTML = '<span class="no-match">没有找到匹配项</span>';
        replaceInfo.className = 'replace-info';
    } else {
        replaceInfo.innerHTML = `找到 <span class="match-count">${matches.length}</span> 处匹配`;
        replaceInfo.className = 'replace-info';
    }
}

/* 在模态框中替换当前匹配 */
function replaceCurrentInModal() {
    const searchTerm = document.getElementById('replaceSearchInput').value.trim();
    const replaceTerm = document.getElementById('replaceTargetInput').value;

    if (!searchTerm) {
        showError('请输入搜索内容');
        return;
    }

    const matches = findAllMatches(searchTerm);
    if (matches.length === 0) {
        showError('没有找到匹配项！');
        return;
    }

    const firstMatch = matches[0];
    const text = getEditorValue();
    setEditorValue(text.substring(0, firstMatch.start) + replaceTerm + text.substring(firstMatch.end));

    updateReplaceInfo();
    showSuccess('已替换 1 处');
}

/* 在模态框中替换全部匹配 */
function replaceAllInModal() {
    const searchTerm = document.getElementById('replaceSearchInput').value.trim();
    const replaceTerm = document.getElementById('replaceTargetInput').value;

    if (!searchTerm) {
        showError('请输入搜索内容');
        return;
    }

    const matches = findAllMatches(searchTerm);
    if (matches.length === 0) {
        showError('没有找到匹配项！');
        return;
    }

    if (!confirm(`确定要替换全部 ${matches.length} 处匹配项吗？`)) {
        return;
    }

    doReplaceAll(matches, replaceTerm);
    updateReplaceInfo();
    showSuccess(`已替换 ${matches.length} 处`);
}
