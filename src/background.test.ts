const loadConfig = jest.fn().mockResolvedValue({});
const setEntityState = jest.fn().mockResolvedValue(undefined);
const testConnection = jest.fn();

jest.mock("./config", () => ({ loadConfig }));
jest.mock("./hass", () => ({ setEntityState, testConnection }));

const heartbeatAlarmName = "meeting-state-heartbeat";
const queryTabs = jest.fn();
const getAlarm = jest.fn();
const createAlarm = jest.fn();
const addAlarmListener = jest.fn();
const addStartupListener = jest.fn();
const addStorageListener = jest.fn();

function loadBackground(
    existingAlarm?: chrome.alarms.Alarm,
    sessionState: Record<string, unknown> = {}
) {
    jest.resetModules();
    queryTabs.mockReset();
    loadConfig.mockReset();
    loadConfig.mockResolvedValue({});
    getAlarm.mockReset();
    createAlarm.mockReset();
    addAlarmListener.mockReset();
    addStartupListener.mockReset();
    addStorageListener.mockReset();
    setEntityState.mockReset();
    setEntityState.mockResolvedValue(undefined);
    testConnection.mockReset();
    testConnection.mockResolvedValue({ success: true, message: "ok" });
    getAlarm.mockImplementation(
        (_name: string, callback: (alarm?: chrome.alarms.Alarm) => void) =>
            callback(existingAlarm)
    );

    (global as any).chrome = {
        alarms: {
            get: getAlarm,
            create: createAlarm,
            onAlarm: { addListener: addAlarmListener },
        },
        action: {
            setBadgeText: jest.fn(),
            setBadgeBackgroundColor: jest.fn(),
        },
        storage: {
            onChanged: { addListener: addStorageListener },
            session: {
                get: jest.fn(async (key: string) => ({
                    [key]: sessionState[key],
                })),
                remove: jest.fn(async (key: string) => {
                    delete sessionState[key];
                }),
                set: jest.fn(async (items: Record<string, unknown>) => {
                    Object.assign(sessionState, items);
                }),
            },
        },
        runtime: {
            onInstalled: { addListener: jest.fn() },
            onStartup: { addListener: addStartupListener },
            onMessage: { addListener: jest.fn() },
        },
        tabs: {
            query: queryTabs,
            onRemoved: { addListener: jest.fn() },
            onUpdated: { addListener: jest.fn() },
        },
    };

    return require("./background") as typeof import("./background");
}

describe("meeting state reconciliation", () => {
    it("sends off after the last Meet tab is removed", async () => {
        const { requestMeetingStateReconciliation } = loadBackground();
        queryTabs.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([]);

        await requestMeetingStateReconciliation();
        await requestMeetingStateReconciliation();

        expect(setEntityState.mock.calls.map(([_, value]) => value)).toEqual([
            true,
            false,
        ]);
    });

    it("retries a transition after the HA update fails", async () => {
        const { requestMeetingStateReconciliation } = loadBackground();
        queryTabs.mockResolvedValue([{ id: 1 }]);
        setEntityState.mockRejectedValueOnce(new Error("HA unavailable"));

        await expect(requestMeetingStateReconciliation()).rejects.toThrow(
            "HA unavailable"
        );
        await requestMeetingStateReconciliation();

        expect(setEntityState).toHaveBeenCalledTimes(2);
        expect(setEntityState).toHaveBeenLastCalledWith({}, true);
    });

    it("retries a failed final off on the next heartbeat alarm", async () => {
        const { requestMeetingStateReconciliation } = loadBackground();
        const alarmListener = addAlarmListener.mock.calls[0][0];
        queryTabs
            .mockResolvedValueOnce([{ id: 1 }])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);

        await requestMeetingStateReconciliation();
        setEntityState.mockRejectedValueOnce(
            new Error("Home Assistant API request failed: HTTP 503")
        );
        await expect(requestMeetingStateReconciliation()).rejects.toThrow(
            "HTTP 503"
        );

        alarmListener({ name: heartbeatAlarmName });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(setEntityState.mock.calls.map(([_, value]) => value)).toEqual([
            true,
            false,
            false,
        ]);
    });

    it("sends the unchanged observed state after a request fails", async () => {
        const { requestMeetingStateReconciliation } = loadBackground(
            undefined,
            {
                acceptedMeetingState: false,
            }
        );
        queryTabs.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([]);
        setEntityState.mockRejectedValueOnce(new Error("HA unavailable"));

        await expect(requestMeetingStateReconciliation()).rejects.toThrow(
            "HA unavailable"
        );
        await requestMeetingStateReconciliation();

        expect(setEntityState.mock.calls.map(([_, value]) => value)).toEqual([
            true,
            false,
        ]);
    });

    it("renews the Home Assistant lease while a meeting remains open", async () => {
        const { requestMeetingStateReconciliation } = loadBackground(
            undefined,
            {
                acceptedMeetingState: true,
            }
        );
        queryTabs.mockResolvedValue([{ id: 1 }]);

        await requestMeetingStateReconciliation(true);

        expect(setEntityState).toHaveBeenCalledTimes(1);
        expect(setEntityState).toHaveBeenCalledWith({}, true);
    });

    it("does not send idle heartbeats after a service worker restart", async () => {
        const sessionState = {};
        const firstWorker = loadBackground(undefined, sessionState);
        queryTabs.mockResolvedValue([]);

        await firstWorker.requestMeetingStateReconciliation();
        loadBackground(undefined, sessionState);
        const alarmListener = addAlarmListener.mock.calls[0][0];
        queryTabs.mockResolvedValue([]);
        alarmListener({ name: heartbeatAlarmName });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(setEntityState).not.toHaveBeenCalled();
    });

    it("reasserts idle state after a browser restart clears session storage", async () => {
        loadBackground(undefined, {});
        const startupListener = addStartupListener.mock.calls[0][0];
        queryTabs.mockResolvedValue([]);
        startupListener();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(setEntityState).toHaveBeenCalledTimes(1);
        expect(setEntityState).toHaveBeenCalledWith({}, false);
    });

    it("reasserts an active meeting after a browser restart", async () => {
        loadBackground(undefined, {});
        const startupListener = addStartupListener.mock.calls[0][0];
        queryTabs.mockResolvedValue([{ id: 1 }]);
        startupListener();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(setEntityState).toHaveBeenCalledTimes(1);
        expect(setEntityState).toHaveBeenCalledWith({}, true);
    });

    it("resends unchanged idle state after settings are saved", async () => {
        const { requestMeetingStateReconciliation } = loadBackground(
            undefined,
            {
                acceptedMeetingState: false,
            }
        );
        queryTabs.mockResolvedValue([]);
        await requestMeetingStateReconciliation();
        expect(setEntityState).not.toHaveBeenCalled();

        loadConfig.mockResolvedValue({ host: "http://new-ha" });
        addStorageListener.mock.calls[0]?.[0]?.(
            { host: { newValue: "http://new-ha" } },
            "sync"
        );
        await requestMeetingStateReconciliation();
        expect(setEntityState).toHaveBeenCalledTimes(1);
        expect(setEntityState).toHaveBeenCalledWith(
            { host: "http://new-ha" },
            false
        );
    });

    it("reapplies saved settings after the old request finishes", async () => {
        const { requestMeetingStateReconciliation } = loadBackground();
        queryTabs.mockResolvedValue([{ id: 1 }]);
        let release: () => void = () => undefined;
        setEntityState.mockImplementationOnce(
            () =>
                new Promise<void>((resolve) => {
                    release = resolve;
                })
        );
        const pending = requestMeetingStateReconciliation();
        await new Promise((resolve) => setTimeout(resolve, 0));
        loadConfig.mockResolvedValue({ token: "replacement" });
        addStorageListener.mock.calls[0]?.[0]?.(
            { token: { newValue: "replacement" } },
            "sync"
        );
        release();
        await pending;
        expect(setEntityState).toHaveBeenCalledTimes(2);
        expect(setEntityState).toHaveBeenLastCalledWith(
            { token: "replacement" },
            true
        );
    });

    it("ignores session-storage and unrelated sync changes", async () => {
        const { requestMeetingStateReconciliation } = loadBackground(
            undefined,
            { acceptedMeetingState: false }
        );
        queryTabs.mockResolvedValue([]);
        const listener =
            addStorageListener.mock.calls[0]?.[0] ?? (() => undefined);
        listener({ acceptedMeetingState: { newValue: false } }, "session");
        listener({ unrelated: { newValue: true } }, "sync");
        await requestMeetingStateReconciliation();
        expect(setEntityState).not.toHaveBeenCalled();
    });

    it("coalesces concurrent events while one update is in flight", async () => {
        const { requestMeetingStateReconciliation } = loadBackground();
        queryTabs.mockResolvedValue([]);
        let releaseUpdate: () => void = () => undefined;
        setEntityState.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    releaseUpdate = resolve;
                })
        );

        const first = requestMeetingStateReconciliation();
        const second = requestMeetingStateReconciliation();
        await new Promise((resolve) => setTimeout(resolve, 0));
        releaseUpdate();
        await Promise.all([first, second]);

        expect(setEntityState).toHaveBeenCalledTimes(1);
        expect(queryTabs).toHaveBeenCalledTimes(2);
    });
});

describe("connection test", () => {
    const webhookConfig = { method: "webhook", webhook_url: "http://hook" };

    it("waits for an in-flight update before testing", async () => {
        const { requestMeetingStateReconciliation, requestConnectionTest } =
            loadBackground();
        queryTabs.mockResolvedValue([{ id: 1 }]);
        let release: () => void = () => undefined;
        setEntityState.mockImplementationOnce(
            () =>
                new Promise<void>((resolve) => {
                    release = resolve;
                })
        );

        const pending = requestMeetingStateReconciliation();
        const test = requestConnectionTest(webhookConfig as any);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(testConnection).not.toHaveBeenCalled();

        release();
        await pending;
        await expect(test).resolves.toEqual({ success: true, message: "ok" });
    });

    it("reasserts the observed state after a webhook test", async () => {
        const { requestMeetingStateReconciliation, requestConnectionTest } =
            loadBackground(undefined, { acceptedMeetingState: true });
        queryTabs.mockResolvedValue([{ id: 1 }]);

        await requestConnectionTest(webhookConfig as any);
        await requestMeetingStateReconciliation();

        expect(setEntityState).toHaveBeenCalledTimes(1);
        expect(setEntityState).toHaveBeenCalledWith({}, true);
    });

    it("keeps the accepted state after an API test", async () => {
        const { requestMeetingStateReconciliation, requestConnectionTest } =
            loadBackground(undefined, { acceptedMeetingState: true });
        queryTabs.mockResolvedValue([{ id: 1 }]);

        await requestConnectionTest({ method: "api" } as any);
        await requestMeetingStateReconciliation();

        expect(setEntityState).not.toHaveBeenCalled();
    });
});

describe("heartbeat alarm", () => {
    it("recovers a missing alarm when the service worker activates", () => {
        loadBackground();

        expect(getAlarm).toHaveBeenCalledWith(
            heartbeatAlarmName,
            expect.any(Function)
        );
        expect(createAlarm).toHaveBeenCalledWith(heartbeatAlarmName, {
            periodInMinutes: 1,
        });
    });

    it("does not reset an existing alarm when the service worker activates", () => {
        loadBackground({
            name: heartbeatAlarmName,
            scheduledTime: Date.now() + 30_000,
            periodInMinutes: 1,
        });

        expect(getAlarm).toHaveBeenCalledWith(
            heartbeatAlarmName,
            expect.any(Function)
        );
        expect(createAlarm).not.toHaveBeenCalled();
    });
});
