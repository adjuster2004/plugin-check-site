document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);

// Привязываем кнопки экспорта/импорта
document.getElementById('exportBtn').addEventListener('click', exportConfig);
document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
document.getElementById('importFile').addEventListener('change', importConfig);

function saveOptions() {
    const apiUrl = document.getElementById('apiUrl').value.trim();
    const domains = document.getElementById('domains').value.split(',').map(s => s.trim()).filter(Boolean);
    const warningDays = parseInt(document.getElementById('warningDays').value, 10);
    const checkTime = document.getElementById('checkTime').value;
    
    const selectedDays = Array.from(document.querySelectorAll('input[name="days"]:checked')).map(cb => parseInt(cb.value, 10));

    if (!apiUrl) {
        showStatus('Ошибка: Укажите URL Docker-контейнера (API)!', '#ff5630');
        return;
    }

    if (selectedDays.length === 0) {
        showStatus('Ошибка: Выберите хотя бы один день недели!', '#ff5630');
        return;
    }

    chrome.storage.local.set({ apiUrl, domains, warningDays, checkTime, selectedDays }, () => {
        chrome.runtime.sendMessage({ action: "updateSchedule" });
        showStatus('Настройки сохранены и расписание обновлено.', '#36b37e');
    });
}

function restoreOptions() {
    chrome.storage.local.get({
        apiUrl: '', 
        domains: [],
        warningDays: 14,
        checkTime: '10:00',
        selectedDays: [1, 2, 3, 4, 5] 
    }, (items) => {
        document.getElementById('apiUrl').value = items.apiUrl;
        document.getElementById('domains').value = items.domains.join(', ');
        document.getElementById('warningDays').value = items.warningDays;
        document.getElementById('checkTime').value = items.checkTime;
        
        document.querySelectorAll('input[name="days"]').forEach(cb => {
            cb.checked = items.selectedDays.includes(parseInt(cb.value, 10));
        });
    });
}

// === Функция Экспорта ===
function exportConfig() {
    chrome.storage.local.get(null, (items) => {
        const blob = new Blob([JSON.stringify(items, null, 2)], {type: "application/json"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ssl_monitor_config.json';
        a.click();
    });
}

// === Функция Импорта ===
function importConfig(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const config = JSON.parse(e.target.result);
            // Сохраняем загруженный конфиг в память расширения
            chrome.storage.local.set(config, () => {
                restoreOptions(); // Обновляем визуальные поля на странице
                chrome.runtime.sendMessage({ action: "updateSchedule" }); // Дергаем фоновый скрипт пересчитать таймер
                showStatus('Конфигурация успешно загружена!', '#36b37e');
            });
        } catch (err) {
            showStatus('Ошибка чтения файла. Проверьте JSON.', '#ff5630');
        }
    };
    reader.readAsText(file);
    
    // Сбрасываем значение input, чтобы можно было загрузить тот же файл еще раз, если нужно
    event.target.value = '';
}

function showStatus(text, color) {
    const status = document.getElementById('status');
    status.textContent = text;
    status.style.color = color;
    setTimeout(() => { status.textContent = ''; }, 3000);
}