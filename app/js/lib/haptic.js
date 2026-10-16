// Small taps you can feel. Android phones: the vibrate call. iPhones (iOS 17.4+): toggling a hidden switch makes Safari tap.
// Anywhere else it quietly does nothing.
// A brand-new hidden switch for every tap, clicked while your touch is still being handled (the way the open-source "ios-haptics" does it)
function iosTick() {
  try {
    const label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    document.head.appendChild(label);
    label.click();
    document.head.removeChild(label);
  } catch { /* no haptics here */ }
}

function buzz(ms, again = 0) {
  try {
    if (navigator.vibrate) return navigator.vibrate(again ? [ms, 50, ms] : ms);
    iosTick();
    if (again) setTimeout(iosTick, 90);
  } catch { /* no haptics here */ }
}

export const tap = () => buzz(10);          // tab, menu, pickers
export const success = () => buzz(12, 1);   // saved
export const warn = () => buzz(25, 1);      // deleted
