import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { Config, defaultConfig, loadConfig, saveConfig } from "./config";

const Options = () => {
    const [config, setConfig] = useState<Config>(defaultConfig);
    const [status, setStatus] = useState<string>("");

    useEffect(() => {
        loadConfig().then(setConfig);
    }, []);

    const save = () => {
        saveConfig(config).then(() => {
            setStatus("Options saved");
            const timeout = setTimeout(() => {
                setStatus("");
            }, 1000);
            return () => clearTimeout(timeout);
        });
    };
    return (
        <>
            <div>
                <label htmlFor="host">Home Assistant Base URL</label>
                <input
                    name="host"
                    id="host"
                    value={config.host}
                    onChange={(e) =>
                        setConfig({ ...config, host: e.target.value })
                    }
                />
            </div>
            <div>
                <label htmlFor="token">Authorization Token</label>
                <input
                    name="token"
                    id="token"
                    value={config.token}
                    onChange={(e) =>
                        setConfig({ ...config, token: e.target.value })
                    }
                />
            </div>
            <div>
                <label htmlFor="entity_id">Entity ID</label>
                <input
                    name="entity_id"
                    id="entity_id"
                    value={config.entity_id}
                    onChange={(e) =>
                        setConfig({ ...config, entity_id: e.target.value })
                    }
                />
            </div>
            <div>{status}</div>
            <button onClick={save}>Save</button>
        </>
    );
};

ReactDOM.render(
    <React.StrictMode>
        <Options />
    </React.StrictMode>,
    document.getElementById("root")
);
