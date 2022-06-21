import { loadConfig } from "./config";
import { setEntityState } from "./hass";

// Cache the previous state
let wasInMeeting: boolean | null = null;

async function updateMeetingStateIfNeeded() {
    const tabs = await chrome.tabs.query({
        url: "https://meet.google.com/*-*-*",
    });
    const isInMeeting = tabs.length > 0;

    // Don't send an entity update if the state hasn't changed
    if (wasInMeeting === isInMeeting) {
        return;
    }

    wasInMeeting = isInMeeting;

    // Set the action indicator immediately
    chrome.action.setBadgeText({ text: isInMeeting ? "mtg" : "" });
    chrome.action.setBadgeBackgroundColor({
        color: isInMeeting ? "red" : "green",
    });

    // Send the entity update to Home Assistant
    const config = await loadConfig();
    return await setEntityState(config, isInMeeting);
}

// Run once installed and continue listening for tab URL changes
chrome.runtime.onInstalled.addListener(updateMeetingStateIfNeeded);
chrome.tabs.onRemoved.addListener(updateMeetingStateIfNeeded);
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (changeInfo.status === "complete") {
        updateMeetingStateIfNeeded();
    }
});
