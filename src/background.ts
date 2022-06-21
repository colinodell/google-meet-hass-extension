import { loadConfig } from "./config";
import { setEntityState } from "./hass";

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
        loadConfig().then((config) => {
            setEntityState(config, newValue);
            chrome.action.setBadgeText({ text: newValue ? "mtg" : "" });
            chrome.action.setBadgeBackgroundColor({
                color: newValue ? "red" : "green",
            });
        });
    }
}

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (changeInfo.status === "complete") {
        updateMeetingStateIfNeeded();
    }
});

chrome.tabs.onRemoved.addListener(updateMeetingStateIfNeeded);
chrome.runtime.onInstalled.addListener(updateMeetingStateIfNeeded);
