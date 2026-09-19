/** `/login` and the guest gate. */
export const auth = {
  title: 'Choose a profile',
  metaTitle: 'Choose a profile',
  continueAs: (name: string) => `Continue as ${name}`,
  guest: 'Continue as a guest',
  guestNote: 'A guest profile keeps your bag and Looks on this device.',
  signInToContinue: 'Sign in to continue.',
  signedInAs: (name: string) => `Signed in as ${name}`,

  nameLabel: 'Your name',
  noProfiles: 'No profiles yet.',
  noProfilesNote: 'Continue with your name below.',
  profilesUnavailable: 'Profiles are unavailable right now.',
  errors: {
    missing: 'Choose a profile to continue.',
    unknown: 'That profile no longer exists. Choose another one.',
    guest: 'Sign-in did not go through. Enter your name and continue again.',
  } as Record<string, string>,
}

export type AuthMessages = typeof auth
