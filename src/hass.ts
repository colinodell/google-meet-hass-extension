import { Config } from "./config";
import { isInMeeting } from "./meeting";

export const HOME_ASSISTANT_REQUEST_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(input: RequestInfo, init: RequestInit) {
    const controller = new AbortController();
    const timeout = setTimeout(
        () => controller.abort(),
        HOME_ASSISTANT_REQUEST_TIMEOUT_MS
    );

    try {
        return await fetch(input, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
}

function requireSuccessfulResponse(response: Response, requestName: string) {
    if (response.status < 200 || response.status >= 300) {
        throw new Error(`${requestName} failed: HTTP ${response.status}`);
    }
}

async function setEntityStateAPI(config: Config, newValue: boolean) {
    const response = await fetchWithTimeout(
        config.host +
            "/api/services/homeassistant/" +
            (newValue ? "turn_on" : "turn_off"),
        {
            method: "POST",
            headers: {
                Authorization: "Bearer " + config.token,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                entity_id: config.entity_id,
            }),
        }
    );

    requireSuccessfulResponse(response, "Home Assistant API request");
}

async function setEntityStateWebhook(config: Config, newValue: boolean) {
    const response = await fetchWithTimeout(config.webhook_url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            value: newValue ? "on" : "off",
        }),
    });

    requireSuccessfulResponse(response, "Home Assistant webhook request");
}

export async function setEntityState(config: Config, newValue: boolean) {
    if (config.method === "webhook") {
        return await setEntityStateWebhook(config, newValue);
    } else {
        return await setEntityStateAPI(config, newValue);
    }
}

export interface TestResult {
    success: boolean;
    message: string;
}

async function testConnectionAPI(config: Config): Promise<TestResult> {
    try {
        const { status } = await fetchWithTimeout(
            config.host + "/api/states/" + config.entity_id,
            {
                method: "GET",
                headers: {
                    Authorization: "Bearer " + config.token,
                    "Content-Type": "application/json",
                },
            }
        );

        switch (status) {
            case 200:
                return {
                    success: true,
                    message: "API configuration is valid",
                };
            case 401:
                return {
                    success: false,
                    message: "Invalid auth token",
                };
            case 404:
                return {
                    success: false,
                    message: "Entity not found, or incorrect base URL",
                };
            default:
                return {
                    success: false,
                    message: "Unexpected error: HTTP " + status,
                };
        }
    } catch (error) {
        return {
            success: false,
            message: "Unexpected error: " + error,
        };
    }
}

async function testConnectionWebhook(config: Config): Promise<TestResult> {
    try {
        // Options page has "tabs" + Meet host_permissions; send observed state
        // so Test never leaves an idle helper stuck "on".
        const value = (await isInMeeting()) ? "on" : "off";
        const response = await fetchWithTimeout(config.webhook_url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                value,
            }),
        });

        if (response.status === 200) {
            return {
                success: true,
                message: "Webhook configuration is valid",
            };
        } else {
            return {
                success: false,
                message: "Webhook test failed: HTTP " + response.status,
            };
        }
    } catch (error) {
        return {
            success: false,
            message: "Webhook test failed: " + error,
        };
    }
}

export async function testConnection(config: Config): Promise<TestResult> {
    if (config.method === "webhook") {
        return await testConnectionWebhook(config);
    } else {
        return await testConnectionAPI(config);
    }
}
