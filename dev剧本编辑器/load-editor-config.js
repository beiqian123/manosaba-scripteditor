/* 加载外置 editor-config.json 配置，动态设置页面标题、版本号、底部文字 */
(function() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'editor-config.json', true);
    xhr.onload = function() {
        if (xhr.status === 200) {
            try {
                var cfg = JSON.parse(xhr.responseText);

                /* 设置页面标题 */
                if (cfg.title) {
                    document.title = cfg.title;
                }

                /* 只在主编辑器页面（有版本徽章）设置 h1 标题 */
                if (cfg.title) {
                    var badge = document.querySelector('.version-badge');
                    if (badge) {
                        var h1 = document.querySelector('.header h1');
                        if (h1) {
                            h1.childNodes.forEach(function(node) {
                                if (node.nodeType === 3) {
                                    node.textContent = cfg.title + ' ';
                                }
                            });
                        }
                    }
                }

                /* 设置版本号徽章 */
                if (cfg.version) {
                    var badge = document.querySelector('.version-badge');
                    if (badge) badge.textContent = cfg.version;
                }

                /* 设置底部文字 */
                if (cfg.footer) {
                    var footer = document.querySelector('.footer p');
                    if (footer) footer.textContent = cfg.footer;
                }

                /* 设置标题栏颜色（通过 CSS 变量，不影响 dark-blue/light-blue 等固有主题） */
                if (cfg.headerColor) {
                    document.documentElement.style.setProperty('--header-color', cfg.headerColor);
                }
            } catch(e) {
                console.error('editor-config.json 解析失败:', e);
            }
        }
    };
    xhr.send();
})();
