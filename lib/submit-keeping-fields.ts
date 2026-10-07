import { startTransition, type FormEvent } from 'react'

/**
 * `onSubmit` for a form driven by `useActionState`, in place of `action={formAction}`.
 *
 * React 19 resets a form after its `action` finishes. The text inputs of the panel
 * are controlled and survive that, but Radix's Checkbox listens for the form's
 * `reset` event and sets itself back to unticked, so every answer that came back
 * with an error — a message, a validation error — cleared the ticked sizes and
 * versions of a bike model, and the bike types of a route. Submitting from
 * `onSubmit` and calling the action ourselves means the form is never reset: what
 * was typed and ticked is still there when the error shows.
 */
export function submitKeepingFields(formAction: (payload: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const payload = new FormData(event.currentTarget)
    startTransition(() => formAction(payload))
  }
}
