// Слушаем команды из настроек для обновления расписания
chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "updateSchedule") {
        scheduleNextRun();
    }
});

// Перезапускаем расписание при старте браузера или обновлении плагина
chrome.runtime.onStartup.addListener(scheduleNextRun);
chrome.runtime.onInstalled.addListener(scheduleNextRun);

// Срабатывание таймера
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "sslCheckAlarm") {
        runBackgroundCheck();
        scheduleNextRun(); // Планируем следующую проверку
    }
});

function scheduleNextRun() {
    chrome.storage.local.get(['checkTime', 'selectedDays'], (config) => {
        if (!config.checkTime || !config.selectedDays || config.selectedDays.length === 0) {
            chrome.alarms.clear("sslCheckAlarm");
            return;
        }

        const [hours, minutes] = config.checkTime.split(':').map(Number);
        const now = new Date();
        
        // Создаем объект времени для проверки на СЕГОДНЯ
        let nextRun = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);

        // Если время на сегодня уже прошло, начинаем искать с завтрашнего дня
        if (now.getTime() >= nextRun.getTime()) {
            nextRun.setDate(nextRun.getDate() + 1);
        }

        // Крутим дни вперед, пока не попадем в день, отмеченный галочкой
        while (!config.selectedDays.includes(nextRun.getDay())) {
            nextRun.setDate(nextRun.getDate() + 1);
        }

        // Заводим системный будильник Chrome
        chrome.alarms.create("sslCheckAlarm", { when: nextRun.getTime() });
        console.log(`[SSL Monitor] Следующая автоматическая проверка запланирована на: ${nextRun.toLocaleString()}`);
    });
}

// Сама логика опроса API (работает в фоне)
async function runBackgroundCheck() {
    chrome.storage.local.get(['domains', 'apiUrl', 'warningDays'], async (config) => {
        if (!config.domains || config.domains.length === 0 || !config.apiUrl) return;

        try {
            const response = await fetch(`${config.apiUrl}?domains=${config.domains.join(',')}`);
            const data = await response.json();
            
            let problemDomains = [];

            for (const [domain, info] of Object.entries(data)) {
                let hasSslIssue = info.ssl.status === 'error' || info.ssl.days_left <= config.warningDays;
                let hasDomainIssue = info.domain.status === 'error' || info.domain.days_left <= config.warningDays;

                if (hasSslIssue || hasDomainIssue) {
                    problemDomains.push(domain);
                }
            }

            // Отправляем уведомление ТОЛЬКО если есть проблемы (чтобы не спамить каждый день)
            if (problemDomains.length > 0) {
                chrome.notifications.create({
                    type: "basic",
                    iconUrl: "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>⚠️</text></svg>",
                    title: "Внимание! Проблемы с SSL",
                    message: `Сайты требуют внимания:\n${problemDomains.join(', ')}`,
                    priority: 2
                });
            }
        } catch (error) {
            console.error("[Site Monitor] Ошибка API при фоновой проверке", error);
        }
    });
}
