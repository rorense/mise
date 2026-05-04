import { useRef } from 'react';
import {
  findNodeHandle,
  Platform,
  ScrollView,
  TextInput,
} from 'react-native';

export const KEYBOARD_VERTICAL_OFFSET = 72;

export const KEYBOARD_AVOIDING_BEHAVIOR: 'padding' | 'height' =
  Platform.OS === 'ios' ? 'padding' : 'height';

export function useKeyboardSafeScroll<T extends ScrollView>() {
  const scrollRef = useRef<T>(null);

  const scrollFocusedInputIntoView = () => {
    requestAnimationFrame(() => {
      const textInputState = (TextInput as unknown as {
        State?: {
          currentlyFocusedInput?: unknown;
          currentlyFocusedField?: () => unknown;
        };
      }).State;
      const currentInput =
        typeof textInputState?.currentlyFocusedInput === 'function'
          ? textInputState.currentlyFocusedInput()
          : null;
      const inputHandle = currentInput ? findNodeHandle(currentInput) : null;
      const scrollRefValue = scrollRef.current as unknown as {
        scrollResponderScrollNativeHandleToKeyboard?: (
          nodeHandle: number,
          additionalOffset: number,
          preventNegativeScrollOffset: boolean
        ) => void;
      } | null;
      if (!inputHandle || !scrollRefValue) {
        scrollRef.current?.scrollToEnd({ animated: true });
        return;
      }
      if (
        typeof scrollRefValue.scrollResponderScrollNativeHandleToKeyboard !==
        'function'
      ) {
        scrollRef.current?.scrollToEnd({ animated: true });
        return;
      }
      scrollRefValue.scrollResponderScrollNativeHandleToKeyboard(
        inputHandle,
        24,
        true
      );
    });
  };

  return {
    scrollRef,
    scrollFocusedInputIntoView,
  };
}
