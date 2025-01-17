import { OnboardingOption, OptionsWrapper, OptionsDivider } from './OnboardingOption';

import { OnboardingButtonCta } from './Buttons/OnboardingButtonCta';
import { OnboardingButtonBack } from './Buttons/OnboardingButtonBack';
import { OnboardingButtonSkip } from './Buttons/OnboardingButtonSkip';

import { ConnectDevicePromptManager } from './ConnectDevicePromptManager/ConnectDevicePromptManager';
import { OnboardingLayout } from './OnboardingLayout';
import { Hologram } from './Hologram';
import { DeviceAnimation, type DeviceAnimationType } from './DeviceAnimation/DeviceAnimation';
import { OnboardingStepBox, type OnboardingStepBoxProps } from './OnboardingStepBox';
import { SkipStepConfirmation } from './SkipStepConfirmation';
import { OnboardingProgressBar } from './OnboardingProgressBar';

export {
    OnboardingButtonCta,
    OnboardingButtonBack,
    OnboardingButtonSkip,
    OnboardingOption,
    OptionsWrapper,
    OptionsDivider,
    ConnectDevicePromptManager,
    OnboardingLayout,
    Hologram,
    DeviceAnimation,
    OnboardingStepBox,
    SkipStepConfirmation,
    OnboardingProgressBar,
};

export type { DeviceAnimationType, OnboardingStepBoxProps };
