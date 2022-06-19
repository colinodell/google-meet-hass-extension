let inMeeting = undefined;

function updateMeetingStateIfNeeded() {
    chrome.tabs.query({url: "https://meet.google.com/*-*-*"}, function(tabs) {
        setInMeeting(tabs.length > 0);
    });
}

function setInMeeting(newValue) {
    if (inMeeting !== newValue) {
        inMeeting = newValue;
        setEntityState(newValue);
    }
}

function setEntityState(newValue) {
    chrome.storage.sync.get({
        host: 'http://homeassistant.local',
        token: 'xxxxxxx',
        entity_id: 'input_boolean.in_meeting',
    }, function(items) {
        fetch(items.host + '/api/states/' + items.entity_id, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + items.token,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                'state': newValue ? 'on' : 'off',
            }),
        });
    });
}

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete') {
        updateMeetingStateIfNeeded();
    }
})

chrome.tabs.onRemoved.addListener(updateMeetingStateIfNeeded);
chrome.runtime.onInstalled.addListener(updateMeetingStateIfNeeded);
