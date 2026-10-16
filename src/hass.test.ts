import { Config } from "./config";
import {
    HOME_ASSISTANT_REQUEST_TIMEOUT_MS,
    setEntityState,
    testConnection,
} from "./hass";

const apiConfig: Config = {
    host: "https://ha.example.test",
    token: "token",
    entity_id: "input_boolean.in_meeting",
    method: "api",
    webhook_url: "",
};

describe("setEntityState", () => {
    beforeEach(() => {
        global.fetch = jest
            .fn()
            .mockResolvedValue({ status: 200 }) as jest.Mock;
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.resetAllMocks();
    });

    it("turns entities on through Home Assistant services", async () => {
        await setEntityState(apiConfig, true);

        expect(global.fetch).toHaveBeenCalledWith(
            "https://ha.example.test/api/services/homeassistant/turn_on",
            {
                method: "POST",
                headers: {
                    Authorization: "Bearer token",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    entity_id: "input_boolean.in_meeting",
                }),
                signal: expect.any(AbortSignal),
            }
        );
    });

    it("turns entities off through Home Assistant services", async () => {
        await setEntityState(apiConfig, false);

        expect(global.fetch).toHaveBeenCalledWith(
            "https://ha.example.test/api/services/homeassistant/turn_off",
            expect.objectContaining({
                body: JSON.stringify({
                    entity_id: "input_boolean.in_meeting",
                }),
            })
        );
    });

    it("keeps webhook updates on the configured webhook URL", async () => {
        await setEntityState(
            {
                ...apiConfig,
                method: "webhook",
                webhook_url: "https://ha.example.test/api/webhook/meet",
            },
            true
        );

        expect(global.fetch).toHaveBeenCalledWith(
            "https://ha.example.test/api/webhook/meet",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    value: "on",
                }),
                signal: expect.any(AbortSignal),
            }
        );
    });

    it.each([
        ["api", apiConfig, "Home Assistant API request failed: HTTP 503"],
        [
            "webhook",
            {
                ...apiConfig,
                method: "webhook" as const,
                webhook_url: "https://ha.example.test/api/webhook/meet",
            },
            "Home Assistant webhook request failed: HTTP 503",
        ],
    ])("rejects non-2xx %s responses", async (_, config, expectedMessage) => {
        (global.fetch as jest.Mock).mockResolvedValue({ status: 503 });

        await expect(setEntityState(config, true)).rejects.toMatchObject({
            message: expectedMessage,
        });
    });

    it("aborts a hung Home Assistant request after the request timeout", async () => {
        jest.useFakeTimers();
        let requestSignal: AbortSignal | undefined;
        (global.fetch as jest.Mock).mockImplementation(
            (_input: RequestInfo, init: RequestInit) =>
                new Promise((_resolve, reject) => {
                    requestSignal = init.signal as AbortSignal;
                    requestSignal.addEventListener("abort", () => {
                        reject(new Error("request aborted"));
                    });
                })
        );

        const request = setEntityState(apiConfig, true);
        jest.advanceTimersByTime(HOME_ASSISTANT_REQUEST_TIMEOUT_MS);

        await expect(request).rejects.toThrow("request aborted");
        expect(requestSignal?.aborted).toBe(true);
    });
});

const webhookConfig: Config = {
    ...apiConfig,
    method: "webhook",
    webhook_url: "https://ha.example.test/api/webhook/meet",
};

describe("testConnection webhook", () => {
    const queryTabs = jest.fn();

    beforeEach(() => {
        global.fetch = jest
            .fn()
            .mockResolvedValue({ status: 200 }) as jest.Mock;
        queryTabs.mockReset();
        Object.assign(globalThis, {
            chrome: {
                tabs: {
                    query: queryTabs,
                },
            },
        });
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    it("posts off when no Meet meeting tabs are open", async () => {
        queryTabs.mockResolvedValue([]);

        const result = await testConnection(webhookConfig);

        expect(result.success).toBe(true);
        expect(queryTabs).toHaveBeenCalledWith({
            url: "https://meet.google.com/*-*-*",
        });
        expect(global.fetch).toHaveBeenCalledWith(
            "https://ha.example.test/api/webhook/meet",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ value: "off" }),
            })
        );
    });

    it("posts on when a Meet meeting tab is open", async () => {
        queryTabs.mockResolvedValue([{ id: 1 }]);

        const result = await testConnection(webhookConfig);

        expect(result.success).toBe(true);
        expect(global.fetch).toHaveBeenCalledWith(
            "https://ha.example.test/api/webhook/meet",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ value: "on" }),
            })
        );
    });
});
