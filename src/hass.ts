import { Config } from "./config";

export async function setEntityState(config: Config, newValue: boolean) {
    await fetch(config.host + "/api/states/" + config.entity_id, {
        method: "POST",
        headers: {
            Authorization: "Bearer " + config.token,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            state: newValue ? "on" : "off",
        }),
    });
}

export interface TestResult {
    success: boolean;
    message: string;
}

export async function testConnection(config: Config): Promise<TestResult> {
    try {
        const { status } = await fetch(
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
                    message: "Configuration is valid",
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
