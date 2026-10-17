// Meet call URLs look like https://meet.google.com/abc-defg-hij
export const MEETING_TAB_URL_PATTERN = "https://meet.google.com/*-*-*";

export async function queryMeetingTabs(): Promise<chrome.tabs.Tab[]> {
    return chrome.tabs.query({ url: MEETING_TAB_URL_PATTERN });
}

export async function isInMeeting(): Promise<boolean> {
    const tabs = await queryMeetingTabs();
    return tabs.length > 0;
}
