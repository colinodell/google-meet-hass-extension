import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { Config, defaultConfig, loadConfig, saveConfig, UpdateMethod } from "./config";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import LoadingButton from "@mui/lab/LoadingButton";
import {
    Alert,
    Box,
    Button,
    Divider,
    FormControl,
    FormControlLabel,
    FormLabel,
    IconButton,
    InputAdornment,
    Radio,
    RadioGroup,
    Snackbar,
    Stack,
    TextField,
} from "@mui/material";
import { testConnection, TestResult } from "./hass";

enum TestStatus {
    NotTested,
    Testing,
    Complete,
}

const Options = () => {
    const [config, setConfig] = useState<Config>(defaultConfig);
    const [saved, setSaved] = useState<boolean>(false);
    const [testStatus, setTestStatus] = useState<TestStatus>(
        TestStatus.NotTested
    );
    const [testResult, setTestResult] = useState<TestResult>({
        success: false,
        message: "Testing...",
    });
    const [showToken, setShowToken] = useState<boolean>(false);

    // Populate the previous configuration on load
    useEffect(() => {
        loadConfig().then(setConfig);
    }, []);

    const test = async () => {
        setTestStatus(TestStatus.Testing);

        const result = await testConnection(config);

        setTestResult(result);
        setTestStatus(TestStatus.Complete);
    };

    const save = async () => {
        await saveConfig(config);

        setSaved(true);

        const timeout = setTimeout(() => {
            setSaved(false);
        }, 1000);
        return () => clearTimeout(timeout);
    };

    return (
        <>
            <Stack spacing={2}>
                <Stack direction="row" spacing={2}>
                    <img src="icon48.png" alt="Logo" />
                    <h1>Google Meet &lt;=&gt; Home Assistant Configuration</h1>
                </Stack>
                <Divider />
                <Stack
                    spacing={2}
                    sx={{
                        width: 400,
                    }}
                >
                    <Box>
                        <FormControl component="fieldset">
                            <FormLabel component="legend">Update Method</FormLabel>
                            <RadioGroup
                                value={config.method}
                                onChange={(e) =>
                                    setConfig({ ...config, method: e.target.value as UpdateMethod })
                                }
                            >
                                <FormControlLabel value="api" control={<Radio />} label="API" />
                                <FormControlLabel value="webhook" control={<Radio />} label="Webhook" />
                            </RadioGroup>
                        </FormControl>
                    </Box>
                    {config.method === "api" && (
                        <Box>
                            <TextField
                                id="host"
                                name="host"
                                label="Home Assistant Base URL"
                                value={config.host}
                                onChange={(e) =>
                                    setConfig({ ...config, host: e.target.value })
                                }
                                helperText="No trailing slashes; ex: http://homeassistant.local"
                                variant="standard"
                                fullWidth
                            />
                        </Box>
                    )}
                    {config.method === "webhook" && (
                        <Box>
                            <TextField
                                id="webhook_url"
                                name="webhook_url"
                                label="Webhook URL"
                                value={config.webhook_url}
                                onChange={(e) =>
                                    setConfig({ ...config, webhook_url: e.target.value })
                                }
                                helperText="Full webhook URL including entity ID; ex: https://ha.example.com/api/webhook/entity_webhook"
                                variant="standard"
                                fullWidth
                                required
                            />
                        </Box>
                    )}
                    {config.method === "api" && (
                        <Box>
                            <TextField
                                id="token"
                                name="token"
                                type={showToken ? "text" : "password"}
                                label="Authorization Token"
                                value={config.token}
                                onChange={(e) =>
                                    setConfig({ ...config, token: e.target.value })
                                }
                                variant="standard"
                                fullWidth
                                required
                                InputProps={{
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <IconButton
                                                aria-label="Toggle auth token visibility"
                                                onClick={() =>
                                                    setShowToken(!showToken)
                                                }
                                                edge="end"
                                            >
                                                {showToken ? (
                                                    <Visibility />
                                                ) : (
                                                    <VisibilityOff />
                                                )}
                                            </IconButton>
                                        </InputAdornment>
                                    ),
                                }}
                            />
                        </Box>
                    )}
                    {config.method === "api" && (
                        <Box>
                            <TextField
                                id="entity_id"
                                name="entity_id"
                                label="Entity ID"
                                value={config.entity_id}
                                onChange={(e) =>
                                    setConfig({
                                        ...config,
                                        entity_id: e.target.value,
                                    })
                                }
                                variant="standard"
                                fullWidth
                                required
                            />
                        </Box>
                    )}
                    <Stack direction="row" spacing={2}>
                        <LoadingButton
                            size="small"
                            onClick={test}
                            loading={testStatus === TestStatus.Testing}
                            loadingIndicator="Loading..."
                            variant="outlined"
                        >
                            Test
                        </LoadingButton>
                        <Button variant="contained" onClick={save}>
                            Save
                        </Button>
                    </Stack>
                    <Box sx={{ height: 50 }}>
                        <Snackbar
                            open={saved}
                            autoHideDuration={6000}
                            onClose={() => setSaved(false)}
                        >
                            <Alert
                                onClose={() => setSaved(false)}
                                severity="success"
                                sx={{ width: "100%" }}
                            >
                                Configuration saved!
                            </Alert>
                        </Snackbar>
                        <Snackbar
                            open={testStatus === TestStatus.Complete}
                            autoHideDuration={6000}
                            onClose={() => setTestStatus(TestStatus.NotTested)}
                        >
                            <Alert
                                onClose={() =>
                                    setTestStatus(TestStatus.NotTested)
                                }
                                severity={
                                    testResult.success ? "success" : "warning"
                                }
                                sx={{ width: "100%" }}
                            >
                                {testResult.message}
                            </Alert>
                        </Snackbar>
                    </Box>
                </Stack>
            </Stack>
        </>
    );
};

ReactDOM.render(
    <React.StrictMode>
        <Options />
    </React.StrictMode>,
    document.getElementById("root")
);
