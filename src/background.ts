import { Config, loadConfig } from "./config";
import { setEntityState, testConnection, TestResult } from "./hass";
import { isInMeeting } from "./meeting";

let wasInMeeting: boolean | null = null;
let reconciliationPromise: Promise<void> | null = null;
let reconciliationRequested = false;
let heartbeatRequested = false;
let configurationChanged = false;

interface PendingConnectionTest {
    config: Config;
    resolve: (result: TestResult) => void;
}
const pendingConnectionTests: PendingConnectionTest[] = [];

const heartbeatAlarmName = "meeting-state-heartbeat";
const acceptedMeetingStateKey = "acceptedMeetingState";

type StorageWithSession = typeof chrome.storage & {
    session: chrome.storage.StorageArea;
};

// The manifest requires Chrome 102+, where storage.session was introduced.
const sessionStorage = (chrome.storage as StorageWithSession).session;

async function restoreAcceptedMeetingState() {
    if (wasInMeeting !== null) {
        return;
    }

    const storedState = await sessionStorage.get(acceptedMeetingStateKey);
    if (typeof storedState[acceptedMeetingStateKey] === "boolean") {
        wasInMeeting = storedState[acceptedMeetingStateKey];
    }
}

function updateBadge(isInMeeting: boolean) {
    chrome.action.setBadgeText({ text: isInMeeting ? "mtg" : "" });
    chrome.action.setBadgeBackgroundColor({
        color: isInMeeting ? "red" : "green",
    });
}

async function reconcileMeetingState(forceSend: boolean) {
    // Invalidate inside the serialized drain, after any old request completes.
    // Otherwise its late response could mark the new configuration delivered.
    if (configurationChanged) {
        configurationChanged = false;
        await sessionStorage.remove(acceptedMeetingStateKey);
        wasInMeeting = null;
    }
    await restoreAcceptedMeetingState();

    const inMeeting = await isInMeeting();

    updateBadge(inMeeting);

    // Heartbeats renew the HA lease while a meeting is open. Normal
    // reconciliations only send when the observed state differs.
    if (wasInMeeting === inMeeting && !(forceSend && inMeeting)) {
        return;
    }

    const config = await loadConfig();
    try {
        await setEntityState(config, inMeeting);
    } catch (error) {
        // HA may have applied this request even though the response was lost.
        // Forget the acknowledged state so the next reconciliation resends the
        // observed state, even when it equals the last acknowledged one.
        await sessionStorage.remove(acceptedMeetingStateKey);
        wasInMeeting = null;
        throw error;
    }

    // Record the state only after HA accepted the update.
    await sessionStorage.set({ [acceptedMeetingStateKey]: inMeeting });
    wasInMeeting = inMeeting;
}

async function runConnectionTest({ config, resolve }: PendingConnectionTest) {
    resolve(await testConnection(config));

    // A webhook test POSTs a state that may target the saved webhook, so the
    // accepted state can no longer be trusted. Reassert the observed state.
    if (config.method === "webhook") {
        configurationChanged = true;
        reconciliationRequested = true;
    }
}

function hasPendingWork() {
    return reconciliationRequested || pendingConnectionTests.length > 0;
}

// All Home Assistant writes, including the options page's Test, run through
// this drain so a late request can never overwrite a newer observation.
function drainPendingWork() {
    if (reconciliationPromise === null) {
        const drain = (async () => {
            while (hasPendingWork()) {
                const test = pendingConnectionTests.shift();
                if (test) {
                    await runConnectionTest(test);
                    continue;
                }

                reconciliationRequested = false;
                const sendHeartbeat = heartbeatRequested;
                heartbeatRequested = false;
                await reconcileMeetingState(sendHeartbeat);
            }
        })();
        reconciliationPromise = drain;

        const finishDrain = () => {
            if (reconciliationPromise !== drain) {
                return;
            }
            reconciliationPromise = null;
            if (hasPendingWork()) {
                drainPendingWork().catch(logReconciliationError);
            }
        };
        drain.then(finishDrain, finishDrain);
    }

    return reconciliationPromise;
}

export function requestMeetingStateReconciliation(forceSend = false) {
    reconciliationRequested = true;
    heartbeatRequested = heartbeatRequested || forceSend;

    return drainPendingWork();
}

export function requestConnectionTest(config: Config): Promise<TestResult> {
    return new Promise((resolve) => {
        pendingConnectionTests.push({ config, resolve });
        drainPendingWork().catch(logReconciliationError);
    });
}

function logReconciliationError(error: unknown) {
    console.error("Failed to reconcile Google Meet state", error);
}

function handleReconciliationRequest(forceSend = false) {
    requestMeetingStateReconciliation(forceSend).catch(logReconciliationError);
}

function ensureHeartbeat() {
    chrome.alarms.get(heartbeatAlarmName, (alarm) => {
        if (!alarm) {
            chrome.alarms.create(heartbeatAlarmName, { periodInMinutes: 1 });
        }
    });
}

ensureHeartbeat();

chrome.runtime.onInstalled.addListener(() => {
    handleReconciliationRequest();
});
chrome.runtime.onStartup.addListener(() => {
    handleReconciliationRequest();
});
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === heartbeatAlarmName) {
        handleReconciliationRequest(true);
    }
});
chrome.tabs.onRemoved.addListener(() => handleReconciliationRequest());
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (changeInfo.status === "complete") {
        handleReconciliationRequest();
    }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "testConnection") {
        requestConnectionTest(message.config).then(sendResponse);
        return true;
    }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (
        areaName === "sync" &&
        ["host", "token", "entity_id", "method", "webhook_url"].some((key) =>
            Object.prototype.hasOwnProperty.call(changes, key)
        )
    ) {
        configurationChanged = true;
        handleReconciliationRequest();
    }
});
