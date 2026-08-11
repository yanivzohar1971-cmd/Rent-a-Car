# Autocomplete BACKSPACE Fix - Android

## Symptom
When using the autocomplete fields (Brand/Model) on YardCarEditScreen, pressing BACKSPACE once opens the suggestions dropdown, but then BACKSPACE no longer deletes characters until the field loses and regains focus. This creates unacceptable UX where users cannot easily edit their input.

## Root Cause
The dropdown menu (ExposedDropdownMenu/DropdownMenu) is a Popup composable. By default, popups can receive focus. When the dropdown opens, it steals focus from the TextField. Once the popup has focus, the TextField stops receiving keyboard events (including BACKSPACE/DELETE), so these keys appear to do nothing.

## Solution
The fix uses two key techniques:

1. **Non-focusable Popup**: Set `PopupProperties(focusable = false)` on the DropdownMenu. This prevents the popup from stealing focus, ensuring the TextField always receives keyboard events.

2. **Focus Management**: Use `FocusRequester` to explicitly manage TextField focus. After selecting an item from the dropdown, request focus back to the TextField using `focusRequester.requestFocus()`. Also track focus state with `onFocusChanged` to control when the dropdown should expand.

## Implementation
Created `StableAutoCompleteTextField` component that:
- Uses `DropdownMenu` with `PopupProperties(focusable = false)`
- Tracks focus state to expand menu only when TextField is focused
- Uses `FocusRequester` to maintain TextField focus
- Rebuilds TextFieldValue with cursor at end to avoid IME composition issues

Both Brand and Model autocomplete fields now use this stable component, ensuring consistent and reliable BACKSPACE/DELETE behavior.

