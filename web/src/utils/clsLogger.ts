/**
 * CLS Logger (Dev Only)
 * 
 * Logs layout shift events to console for debugging CLS issues.
 * Only active in development mode or when ?debugCls=1 query param is present.
 */

export function initClsLogger() {
  // Only run in dev mode or when debugCls=1 is in URL
  const isDev = import.meta.env.MODE === 'development';
  const urlParams = new URLSearchParams(window.location.search);
  const debugCls = urlParams.get('debugCls') === '1';
  
  if (!isDev && !debugCls) {
    return; // Don't run in production unless explicitly enabled
  }

  if (!('PerformanceObserver' in window)) {
    console.warn('[CLS Logger] PerformanceObserver not supported');
    return;
  }

  let clsValue = 0;
  let shiftCount = 0;

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'layout-shift' && !(entry as any).hadRecentInput) {
          const layoutShiftEntry = entry as PerformanceEntry & {
            value: number;
            hadRecentInput: boolean;
            sources?: Array<{
              node?: Node;
              previousRect?: DOMRectReadOnly;
              currentRect?: DOMRectReadOnly;
            }>;
          };

          clsValue += layoutShiftEntry.value;
          shiftCount++;

          // Try to identify the shifted element
          let elementInfo = 'Unknown element';
          if (layoutShiftEntry.sources && layoutShiftEntry.sources.length > 0) {
            const source = layoutShiftEntry.sources[0];
            if (source.node) {
              const node = source.node as Element;
              elementInfo = node.tagName.toLowerCase();
              if (node.className) {
                elementInfo += `.${node.className.split(' ').join('.')}`;
              }
              if (node.id) {
                elementInfo += `#${node.id}`;
              }
              // Try to get a more specific selector
              try {
                const path: string[] = [];
                let current: Element | null = node;
                while (current && current !== document.body) {
                  let selector = current.tagName.toLowerCase();
                  if (current.id) {
                    selector += `#${current.id}`;
                    path.unshift(selector);
                    break;
                  }
                  if (current.className) {
                    selector += `.${current.className.split(' ').join('.')}`;
                  }
                  path.unshift(selector);
                  current = current.parentElement;
                }
                if (path.length > 0) {
                  elementInfo = path.join(' > ');
                }
              } catch (e) {
                // Ignore selector errors
              }
            }
          }

          console.warn(
            `[CLS Logger] Layout Shift #${shiftCount}:`,
            {
              value: layoutShiftEntry.value.toFixed(4),
              cumulative: clsValue.toFixed(4),
              element: elementInfo,
              hadRecentInput: layoutShiftEntry.hadRecentInput,
            }
          );
        }
      }
    });

    observer.observe({ type: 'layout-shift', buffered: true });

    // Log final CLS on page unload
    window.addEventListener('beforeunload', () => {
      console.log(`[CLS Logger] Final CLS: ${clsValue.toFixed(4)} (${shiftCount} shifts)`);
    });

    console.log('[CLS Logger] Initialized - watching for layout shifts');
  } catch (error) {
    console.error('[CLS Logger] Failed to initialize:', error);
  }
}
