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
            resultsDiv.innerHTML = '<div class="result-item error">Укажите настройки (⚙️).</div>';
            resetUI(loader, btn);
            return;
        }

        let problemDomains = [];
        
        // Опрашиваем домены по одному для детального лога
        for (const domain of config.domains) {
            const cleanDomain = domain.trim();
            if (!cleanDomain) continue;

            // Обновляем текст в лоадере
            loader.innerText = `🔍 Проверяем ${cleanDomain}...`;

            try {
                // Запрашиваем данные только для одного домена
                const response = await fetch(`${config.apiUrl}?domains=${cleanDomain}`);
                const data = await response.json();
                const info = data[cleanDomain];

                const itemDiv = document.createElement('div');
                itemDiv.className = 'result-item';

                // SSL блок
                let sslText = info.ssl.status === 'error' 
                    ? `🚫 SSL: ${info.ssl.message}` 
                    : `🔐 SSL: ${info.ssl.days_left} дн.`;

                // Domain блок
                let domainText = info.domain.status === 'error'
                    ? `🌐 Домен: Ошибка (${info.domain.message})`
                    : `🌐 Домен: ${info.domain.days_left} дн.`;

                const hasIssue = info.ssl.status === 'error' || info.domain.status === 'error' || 
                                info.ssl.days_left <= config.warningDays || info.domain.days_left <= config.warningDays;

                if (hasIssue) {
                    problemDomains.push(cleanDomain);
                    itemDiv.classList.add('error');
                } else {
                    itemDiv.classList.add('ok');
                }

                itemDiv.innerHTML = `<strong>${cleanDomain}</strong><br>
                                     <span style="font-size: 12px;">${sslText}</span><br>
                                     <span style="font-size: 12px;">${domainText}</span>`;
                resultsDiv.appendChild(itemDiv);

            } catch (error) {
                const errDiv = document.createElement('div');
                errDiv.className = 'result-item error';
                errDiv.innerHTML = `<strong>${cleanDomain}</strong><br>🚫 Ошибка связи с API`;
                resultsDiv.appendChild(errDiv);
            }
        }

        loader.innerText = 'Проверка завершена';
        sendSystemNotification(problemDomains, config.domains.length);
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
