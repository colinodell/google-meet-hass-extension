import { loadConfig } from "./config";

let inMeeting: boolean | null = null;

function updateMeetingStateIfNeeded() {
    chrome.tabs.query(
        { url: "https://meet.google.com/*-*-*" },
        function (tabs) {
            setInMeeting(tabs.length > 0);
        }
    );
}

function setInMeeting(newValue: boolean) {
    if (inMeeting !== newValue) {
        inMeeting = newValue;
        setEntityState(newValue);
    }
}

function setEntityState(newValue: boolean) {
    loadConfig().then((config) => {
        fetch(config.host + "/api/states/" + config.entity_id, {
            method: "POST",
            headers: {
                Authorization: "Bearer " + config.token,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                state: newValue ? "on" : "off",
            }),
        });
    });
}

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (changeInfo.status === "complete") {
        updateMeetingStateIfNeeded();
    }
});

chrome.tabs.onRemoved.addListener(updateMeetingStateIfNeeded);
chrome.runtime.onInstalled.addListener(updateMeetingStateIfNeeded);
