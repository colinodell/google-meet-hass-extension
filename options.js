// Saves options to chrome.storage
function save_options() {
    var host = document.getElementById('host').value;
    var token = document.getElementById('token').value;
    var entity_id = document.getElementById('entity_id').value;
    chrome.storage.sync.set({
        host: host,
        token: token,
        entity_id: entity_id
    }, function() {
        // Update status to let user know options were saved.
        var status = document.getElementById('status');
        status.textContent = 'Options saved.';
        setTimeout(function() {
            status.textContent = '';
        }, 750);
    });
}

// Restores options using the preferences stored in chrome.storage.
function restore_options() {
    // Use default value color = 'red' and likesColor = true.
    chrome.storage.sync.get({
        host: 'http://homeassistant.local',
        token: 'xxxxxxx',
        entity_id: 'input_boolean.in_meeting',
    }, function(items) {
        document.getElementById('host').value = items.host;
        document.getElementById('token').value = items.token;
        document.getElementById('entity_id').value = items.entity_id;
    });
}
document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('save').addEventListener('click',
    save_options);