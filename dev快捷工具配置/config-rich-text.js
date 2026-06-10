/* --- 快捷工具配置：富文本编辑与链接管理 ---
 *   execRichCmd 执行富文本命令(加粗/下划线)
 *   insertImageLink, insertAudioLink 插入图片/音频链接
 *   showLinkModal, closeLinkModal, confirmLink 超链接弹窗
 *   依赖: config-core.js (escapeHtml, showSuccess 等) */

/* 执行富文本编辑命令（加粗/下划线等） */
function execRichCmd(command) {
    document.execCommand(command, false, null);
    document.getElementById('editModalDesc').focus();
}

/* 插入图片链接到富文本编辑器 */
function insertImageLink() {
    const url = prompt('请输入图片链接地址：');
    if (url) {
        document.getElementById('editModalDesc').focus();
        document.execCommand('insertHTML', false, `<img src="${escapeHtml(url)}" alt="图片">`);
    }
}

/* 插入音频链接到富文本编辑器 */
function insertAudioLink() {
    const url = prompt('请输入音频链接地址：');
    if (url) {
        document.getElementById('editModalDesc').focus();
        const escapedUrl = escapeHtml(url);
        document.execCommand('insertHTML', false, `<span class="audio-link" contenteditable="false" data-url="${escapedUrl}">🔊</span>`);
    }
}

let currentLinkSelection = null;

/* 打开链接输入弹窗 */
function showLinkModal() {
    const selection = window.getSelection();
    if (selection.rangeCount > 0 && selection.toString().trim()) {
        currentLinkSelection = selection.getRangeAt(0);
        document.getElementById('linkTextInput').value = selection.toString().trim();
    } else {
        currentLinkSelection = null;
        document.getElementById('linkTextInput').value = '';
    }
    document.getElementById('linkUrlInput').value = '';
    document.getElementById('linkInputModal').classList.add('show');
    document.getElementById('linkUrlInput').focus();
}

/* 关闭链接输入弹窗 */
function closeLinkModal() {
    document.getElementById('linkInputModal').classList.remove('show');
    currentLinkSelection = null;
}

/* 确认插入链接 */
function confirmLink() {
    const text = document.getElementById('linkTextInput').value.trim();
    const url = document.getElementById('linkUrlInput').value.trim();
    
    if (!url) {
        showError('请输入链接地址');
        return;
    }
    
    document.getElementById('editModalDesc').focus();
    
    if (currentLinkSelection) {
        const selectedText = currentLinkSelection.toString();
        const linkHtml = `<a href="${escapeHtml(url)}" target="_blank">${escapeHtml(selectedText || text)}</a>`;
        currentLinkSelection.deleteContents();
        currentLinkSelection.insertNode(document.createRange().createContextualFragment(linkHtml));
    } else {
        const displayText = text || url;
        document.execCommand('insertHTML', false, `<a href="${escapeHtml(url)}" target="_blank">${escapeHtml(displayText)}</a>`);
    }
    
    closeLinkModal();
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

/* 富文本编辑器点击事件委托：音频图标点击播放 */
document.addEventListener('click', function(e) {
    const audioLink = e.target.closest('.audio-link');
    if (audioLink && audioLink.closest('#editModalDesc')) {
        const url = audioLink.getAttribute('data-url');
        if (url) {
            showAudioPreviewModal(url);
        }
    }
});

/* 阻止在音频占位符上按回车键时复制元素 */
document.addEventListener('DOMContentLoaded', function() {
    const editor = document.getElementById('editModalDesc');
    if (editor) {
        // 使用 keydown 事件，在 beforeinput 之前拦截
        editor.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                const selection = window.getSelection();
                if (selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    
                    // 检查光标是否在音频占位符或音频链接内
                    const startContainer = range.startContainer;
                    const endContainer = range.endContainer;
                    
                    // 获取光标所在的元素
                    const startEl = startContainer.nodeType === Node.TEXT_NODE ? startContainer.parentNode : startContainer;
                    const endEl = endContainer.nodeType === Node.TEXT_NODE ? endContainer.parentNode : endContainer;
                    
                    // 检查光标是否在音频元素内
                    const placeholderStart = startEl.closest('.audio-placeholder');
                    const placeholderEnd = endEl.closest('.audio-placeholder');
                    const linkStart = startEl.closest('.audio-link');
                    const linkEnd = endEl.closest('.audio-link');
                    
                    if (placeholderStart || placeholderEnd || linkStart || linkEnd) {
                        e.preventDefault();
                        
                        // 确定目标元素（优先级：选中的 > 开始位置的 > 结束位置的）
                        const targetElement = placeholderStart || placeholderEnd || linkStart || linkEnd;
                        const parentElement = targetElement.parentNode;
                        
                        // 在占位符后面插入换行
                        const newText = document.createTextNode('\n');
                        const nextSibling = targetElement.nextSibling;
                        if (nextSibling) {
                            parentElement.insertBefore(newText, nextSibling);
                        } else {
                            parentElement.appendChild(newText);
                        }
                        
                        // 将光标移动到换行后
                        const newRange = document.createRange();
                        newRange.setStartAfter(newText);
                        newRange.collapse(true);
                        
                        selection.removeAllRanges();
                        selection.addRange(newRange);
                        
                        editor.focus();
                    }
                }
            }
        });
    }
});
