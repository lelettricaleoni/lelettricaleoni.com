/*
 * The setup guide of the Google Calendar integration. Plain data, in English like the rest of the panel,
 * shown beside the settings form and on its own tab. A step that matches a field of the form says so
 * (`field`), and `completedSteps` ticks it by itself when the field is filled and valid.
 */

export type GuideField = 'key' | 'calendarId' | 'test'

export interface GuideStep {
  id: string
  title: string
  /** What to do, one short paragraph each. */
  todo: string[]
  /** What you should see when it worked. */
  see: string
  links?: { label: string; href: string }[]
  /** The form field this step is about. */
  field?: GuideField
}

export const GUIDE_STEPS: GuideStep[] = [
  {
    id: 'project',
    title: 'Create a Google Cloud project',
    todo: [
      'Open Google Cloud and create a project, for example "Lelettrica". If you already have one you want to use, skip this step.',
      'It costs nothing: a service account and the Calendar API have no charge at this volume.',
    ],
    see: 'The project name appears at the top left of the Google Cloud console.',
    links: [{ label: 'Create a project', href: 'https://console.cloud.google.com/projectcreate' }],
  },
  {
    id: 'api',
    title: 'Enable the Google Calendar API',
    todo: ['With your project selected at the top, open the Google Calendar API page and press Enable.'],
    see: 'The page says "API enabled" and shows a Manage button.',
    links: [{ label: 'Google Calendar API', href: 'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com' }],
  },
  {
    id: 'service-account',
    title: 'Create a service account',
    todo: [
      'Open Service Accounts and press Create service account.',
      'Give it a name, for example "calendar-sync". You do not need to give it any role: skip the optional steps and press Done.',
    ],
    see: 'The list shows the new account with an e-mail like calendar-sync@your-project.iam.gserviceaccount.com. You will need that e-mail in step 5.',
    links: [{ label: 'Service accounts', href: 'https://console.cloud.google.com/iam-admin/serviceaccounts' }],
  },
  {
    id: 'json-key',
    title: 'Create and download its JSON key',
    todo: [
      'Click the service account, open the Keys tab, press Add key, then Create new key, choose JSON and press Create.',
      'A file ending in .json is downloaded. It is the key: anyone who has it can use the account, so do not send it by e-mail or chat. You only need it for step 7, and you can delete it from your computer afterwards.',
    ],
    see: 'A .json file is in your Downloads folder.',
  },
  {
    id: 'share-calendar',
    title: 'Share a calendar with the service account',
    todo: [
      'In Google Calendar, create a calendar for the bookings (for example "Rentals") or pick one you already have. A separate calendar is the tidiest choice.',
      'Open its Settings and sharing, go to Share with specific people or groups, press Add people and groups, and paste the service account e-mail from step 3.',
      'Set the permission to "Make changes to events" and press Send. Read-only is not enough: the connection test will say so.',
    ],
    see: 'The service account e-mail is in the list of people with the calendar, with "Make changes to events".',
    links: [{ label: 'Google Calendar settings', href: 'https://calendar.google.com/calendar/u/0/r/settings' }],
  },
  {
    id: 'calendar-id',
    title: 'Copy the calendar ID',
    todo: [
      'On the same Settings page, scroll to Integrate calendar and copy the Calendar ID. For a calendar you created it looks like abc123@group.calendar.google.com; for your main calendar it is your e-mail address.',
    ],
    see: 'You have the ID in your clipboard.',
  },
  {
    id: 'upload-key',
    title: 'Upload the key here',
    todo: [
      'In the form, choose the .json file from step 4 (or paste its text) and press Save key.',
      'The key is stored encrypted and is never shown again. If you need to change it later, upload a new one.',
    ],
    see: 'The form shows "Key saved" and the service account e-mail.',
    field: 'key',
  },
  {
    id: 'enter-calendar-id',
    title: 'Enter the calendar ID and the options',
    todo: ['Paste the calendar ID from step 6, choose the options you want and press Save settings.'],
    see: 'The form shows "Settings saved".',
    field: 'calendarId',
  },
  {
    id: 'test',
    title: 'Test the connection',
    todo: [
      'Press Test connection. The panel reads the calendar, creates a small test event and removes it again.',
      'If something is wrong it tells you what: the key, the Calendar API not enabled, the calendar ID, or the sharing permission.',
    ],
    see: 'A green message "The connection works".',
    field: 'test',
  },
  {
    id: 'enable',
    title: 'Turn it on',
    todo: [
      'Press Enable at the top of the page. From now on the integration is on.',
      'To see the events on your phone, open Google Calendar there with the account that owns the calendar and make sure the calendar is ticked.',
    ],
    see: 'The status at the top says Enabled.',
  },
]

export interface GuideProgress {
  hasSecret: boolean
  calendarId: string
  connectionOk: boolean
  testedCalendarId: string
  enabled: boolean
}

/**
 * The steps that are certainly done. The Google steps cannot be seen from here, but a saved key proves the
 * first four (a project, the API, a service account and its key exist), and a passing test proves the sharing.
 */
export function completedSteps(progress: GuideProgress): string[] {
  const done: string[] = []
  const calendarId = progress.calendarId.trim()
  const tested = progress.connectionOk && calendarId !== '' && progress.testedCalendarId === calendarId
  if (progress.hasSecret) done.push('project', 'api', 'service-account', 'json-key', 'upload-key')
  if (tested) done.push('share-calendar')
  if (calendarId !== '') done.push('calendar-id', 'enter-calendar-id')
  if (tested) done.push('test')
  if (progress.enabled) done.push('enable')
  return GUIDE_STEPS.map((step) => step.id).filter((id) => done.includes(id))
}
