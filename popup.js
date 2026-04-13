document.getElementById('checkBtn').addEventListener('click', performCheck);
document.getElementById('openSettings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
});

document.addEventListener('DOMContentLoaded', performCheck);

async function performCheck() {
    const resultsDiv = document.getElementById('results');
    const loader = document.getElementById('loader');
    const btn = document.getElementById('checkBtn');

    resultsDiv.innerHTML = '';
    loader.style.display = 'block';
    btn.disabled = true;

    chrome.storage.local.get(['domains', 'apiUrl', 'warningDays'], async (config) => {
        if (!config.apiUrl || !config.domains || config.domains.length === 0) {
            resultsDiv.innerHTML = '<div class="result-item error">Укажите URL API и список сайтов в настройках (⚙️).</div>';
            resetUI(loader, btn);
            return;
        }

        try {
            const response = await fetch(`${config.apiUrl}?domains=${config.domains.join(',')}`);
            const data = await response.json();
            
            let problemDomains = []; 

            for (const [domain, info] of Object.entries(data)) {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'result-item';
                
                // --- Анализ SSL ---
                let sslText = '';
                let hasSslError = false;
                if (info.ssl.status === 'error') {
                    hasSslError = true;
                    sslText = `🚫 SSL: Ошибка (${info.ssl.message})`;
                } else if (info.ssl.days_left <= config.warningDays) {
                    hasSslError = true;
                    sslText = `🤔 SSL: ${info.ssl.days_left} дн.`;
                } else {
                    sslText = `🔐 SSL: ${info.ssl.days_left} дн.`;
                }

                // --- Анализ Домена ---
                let domainText = '';
                let hasDomainError = false;
                if (info.domain.status === 'error') {
                    hasDomainError = true;
                    domainText = `🚫 Домен: Ошибка WHOIS`;
                } else if (info.domain.days_left <= config.warningDays) {
                    hasDomainError = true;
                    domainText = `🤔 Домен: ${info.domain.days_left} дн.`;
                } else {
                    domainText = `🌐 Домен: ${info.domain.days_left} дн.`;
                }

                // --- Определение общего статуса плашки ---
                if (hasSslError || hasDomainError) {
                    problemDomains.push(domain);
                    itemDiv.classList.add('error'); // Можно разделить на warning/error при желании
                } else {
                    itemDiv.classList.add('ok');
                }

                itemDiv.innerHTML = `<strong>${domain}</strong><br>
                                     <span style="font-size: 12px; color: #42526e;">${sslText}</span><br>
                                     <span style="font-size: 12px; color: #42526e;">${domainText}</span>`;
                resultsDiv.appendChild(itemDiv);
            }

            sendSystemNotification(problemDomains, Object.keys(data).length);

        } catch (error) {
            resultsDiv.innerHTML = `<div class="result-item error">🚫 Ошибка связи с API.</div>`;
        }
        resetUI(loader, btn);
    });
}

function sendSystemNotification(problemDomains, total) {
    let title = "Проверка завершена";
    let message = problemDomains.length > 0 
        ? `Проблемы (${problemDomains.length}/${total}): ${problemDomains.join(', ')}` 
        : `Все сайты (${total} шт.) в порядке!`;
    
    chrome.notifications.create({
        type: "basic",
        iconUrl: "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🛡️</text></svg>",
        title: title,
        message: message,
        priority: 1
    });
}

function resetUI(loader, btn) {
    loader.style.display = 'none';
    btn.disabled = false;
}
