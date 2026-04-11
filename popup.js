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
            // Уточнили текст ошибки
            resultsDiv.innerHTML = '<div class="result-item error">Укажите URL API и список сайтов в настройках (⚙️).</div>';
            resetUI(loader, btn);
            return;
        }

        try {
            const response = await fetch(`${config.apiUrl}?domains=${config.domains.join(',')}`);
            const data = await response.json();
            
            let problemDomains = []; // Собираем имена проблемных доменов в массив

            for (const [domain, info] of Object.entries(data)) {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'result-item';
                
                let statusText = '';

                if (info.status === 'error') {
                    problemDomains.push(domain);
                    itemDiv.classList.add('error');
                    statusText = `🚫 Ошибка: ${info.message || 'Сбой соединения'}`;
                } else if (info.days_left <= config.warningDays) {
                    problemDomains.push(domain);
                    itemDiv.classList.add('warning');
                    statusText = `🤔 Истекает через ${info.days_left} дн.`;
                } else {
                    itemDiv.classList.add('ok');
                    statusText = `Осталось дней: ${info.days_left}`;
                }

                itemDiv.innerHTML = `<strong>${domain}</strong><br>${statusText}`;
                resultsDiv.appendChild(itemDiv);
            }

            // Передаем именно массив в функцию уведомлений
            sendSystemNotification(problemDomains, Object.keys(data).length);

        } catch (error) {
            resultsDiv.innerHTML = `<div class="result-item error">🚫 Ошибка API. Проверьте Docker.</div>`;
        }
        resetUI(loader, btn);
    });
}

function sendSystemNotification(problemDomains, total) {
    let title = "Проверка SSL завершена";
    let message = "";

    if (problemDomains.length > 0) {
        // Если массив не пустой, выводим домены с ошибками
        const domainsText = problemDomains.join(', ');
        message = `Проблемы (${problemDomains.length}/${total}): ${domainsText}`;
    } else {
        message = `Все сертификаты (${total} шт.) в порядке!`;
    }
    
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