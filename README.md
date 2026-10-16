# Google Meet <=> Home Assistant Chrome Extension

![](public/icon128.png)

Chrome extension that relays your Google Meet status (in meeting or not) to Home Assistant so you can build your own DIY "On Air" light or other automations.

It works by detecting whether you have any active meetings open in any Chrome tabs, and then toggles an Input Boolean in Home Assistant accordingly which you can use to create automations from.

See [my blog post for more details](https://www.colinodell.com/blog/202207/diy-on-air-light-automation-google-meet-chrome-extension).

## Installation

Build and install the extension from source:

1. Download this project from GitHub
2. Run `yarn install && yarn build` in the repo root
3. Visit [`chrome://extensions`](chrome://extensions) in your browser
4. Enable Developer mode
5. Click on "Load unpacked extension" and select the `dist` folder that yarn built

If you need a portable build artifact, zip the generated `dist` directory after
building and load the unpacked contents of that archive.

## Updating without losing settings

Keep the installed unpacked directory at the same absolute path. Do not remove
and reinstall the extension, or load each version from a new directory: Chrome
uses the extension ID to keep its settings.

Build the new version in a **separate checkout** — clone or download the
repository somewhere else and run `yarn install && yarn build` there. Then run
the updater from that separate checkout, not from the one whose `dist` folder
you installed:

```sh
node scripts/update-unpacked.cjs /absolute/path/to/installed-extension EXTENSION_ID
```

Copy the ID and directory from the existing extension's Details page. The
updater checks their identity, preserves its manifest key, and backs up the
previous code. It does not read or write browser settings, tokens or cookies. Then
click **Reload** on that same extension in `chrome://extensions`.

## Configuration

The extension now supports two methods for updating Home Assistant entities:

### Method 1: API (Default)
1. [Generate a long-lived access token in Home Assistant](https://www.atomicha.com/home-assistant-how-to-generate-long-lived-access-token-part-1/)
2. [Create a new input boolean in Home Assistant](https://www.home-assistant.io/integrations/input_boolean/). If you use Google Meet on multiple computers or Chrome profiles, create separate input boolean for each one.
3. Click on the Chrome extension in your browser to open the configuration page and configure your Home Assistant URL, auth token, and input boolean entity ID accordingly.

### Method 2: Webhook
1. [Create a webhook automation in Home Assistant](https://www.home-assistant.io/docs/automation/trigger/#webhook-trigger) that receives JSON data with a `value` field
2. Configure the webhook to update your desired entity based on the received value (`"on"` or `"off"`)
3. Click on the Chrome extension in your browser, select "Webhook" as the update method, and enter your webhook URL

**Example webhook automation in Home Assistant:**
```yaml
automation:
  - alias: "Google Meet Status Webhook"
    trigger:
      platform: webhook
      webhook_id: "google_meet_status"
    variables:
      meeting_status: "{{ trigger.json.value }}"
    action:
      choose:
        - conditions:
            - condition: template
              value_template: "{{ meeting_status == 'on' }}"
          sequence:
            - service: input_boolean.turn_on
              target:
                entity_id: input_boolean.in_meeting
        - conditions:
            - condition: template
              value_template: "{{ meeting_status == 'off' }}"
          sequence:
            - service: input_boolean.turn_off
              target:
                entity_id: input_boolean.in_meeting
```

The webhook URL would be: `https://your-ha-domain.com/api/webhook/google_meet_status`

### Reliable cleanup when Chrome closes

Chrome may terminate the extension before its final Home Assistant request
finishes. To ensure the input boolean does not remain on after the browser
closes, add the automation below in Home Assistant and replace
`input_boolean.in_meeting` with the entity you configured in the extension
(API method) or the entity your webhook automation turns on and off (webhook
method, where the extension itself only stores the webhook URL). This is
required for reliable cleanup with either the API or webhook method.

The extension sends an `on` heartbeat once per minute while a meeting tab is
open. Each heartbeat restarts this five-minute lease. Closing the last meeting
tab normally sends `off` immediately; if Chrome exits before that request is
delivered, Home Assistant turns the input boolean off when the lease expires.

```yaml
alias: Google Meet stale session guard
id: google_meet_stale_session_guard
triggers:
  - trigger: event
    event_type: call_service
    event_data:
      domain: homeassistant
      service: turn_on
      service_data:
        entity_id: input_boolean.in_meeting
  - trigger: event
    event_type: call_service
    event_data:
      domain: homeassistant
      service: turn_on
      service_data:
        entity_id:
          - input_boolean.in_meeting
  - trigger: event
    event_type: call_service
    event_data:
      domain: input_boolean
      service: turn_on
      service_data:
        entity_id: input_boolean.in_meeting
  - trigger: event
    event_type: call_service
    event_data:
      domain: input_boolean
      service: turn_on
      service_data:
        entity_id:
          - input_boolean.in_meeting
  - trigger: state
    entity_id: input_boolean.in_meeting
    to: "on"
  - trigger: homeassistant
    event: start
conditions:
  - condition: state
    entity_id: input_boolean.in_meeting
    state: "on"
actions:
  - delay: "00:05:00"
  - condition: state
    entity_id: input_boolean.in_meeting
    state: "on"
  - action: input_boolean.turn_off
    target:
      entity_id: input_boolean.in_meeting
mode: restart
max_exceeded: silent
```

![](screenshot.png)

## Testing

Simply create or join a Google Meet meeting in your browser, and the extension will automatically toggle your input boolean entity in Home Assistant.  The Chrome extension icon should display `mtg` if it detects that you are in a meeting, and the input boolean should toggle itself accordingly when you join/leave meetings.

## Automation Ideas

With everything set up and working you can now use that input boolean to create automations in Home Assistant! For an "On Air" light, you could create an automation that uses any Home Assistant [light integration](https://www.home-assistant.io/integrations/#light) to toggle some light on/off when you join/leave a meeting. This could be a Philips Hue light, a LED embedded in an Arduino/ESP8266/Raspberry Pi, or any other light you have in your Home Assistant instance!

Personally, I've repurposed an older [Adafruit Weather Lamp](https://learn.adafruit.com/feather-weather-lamp) project I built by flashing [WLED](https://www.home-assistant.io/integrations/wled/) onto the board and configuring presets for when I'm in a meeting (spinning red colors) or not (solid green).

## FAQs

**Can I just download this from the Chrome store?** The store listing is currently unavailable. Build and load the extension from source using the [installation steps above](#installation).

**Does this support other browsers and/or meeting providers?** No, and I don't have plans to do so, but PRs to add support are certainly welcome!

**Can this detect if the microphone or camera is actually in use?** No, that's a rabbit hole I've already tried going down without much success.  I'm sure it's possible but the effort required to figure out a reliable, cross-platform way to detect that is simply not worth it.

**Why did you use React for a three-field form? Isn't it overkill?** Yes, but I'm just starting to learn React and thought this would be a great way to practice :)
