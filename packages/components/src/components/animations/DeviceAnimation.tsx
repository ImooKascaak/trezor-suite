import styled, { useTheme } from 'styled-components';
import React, { useRef } from 'react';

import { DeviceModelInternal } from '@trezor/connect';
import { AnimationWrapper, Shape } from './AnimationPrimitives';
import { resolveStaticPath } from '../../utils/resolveStaticPath';

const StyledVideo = styled.video`
    width: 100%;
    height: 100%;
`;

export type AnimationDeviceType =
    | 'BOOTLOADER'
    | 'BOOTLOADER_TWO_BUTTONS' // Only available for T1B1 with old FW
    | 'NORMAL' // Only available for T1B1
    | 'SUCCESS'
    | 'HOLOGRAM';

type DeviceAnimationProps = {
    size?: number;
    type: AnimationDeviceType;
    loop?: boolean;
    shape?: Shape;
    deviceModelInternal?: DeviceModelInternal;
    deviceColor?: string;
};

export const DeviceAnimation = ({
    size,
    type,
    loop = false,
    shape,
    // if no Trezor available, show flagship model
    deviceModelInternal = DeviceModelInternal.T2T1,
    deviceColor,
    ...props
}: DeviceAnimationProps) => {
    const { THEME } = useTheme();
    const hologramRef = useRef<HTMLVideoElement>(null);

    // T2B1 animations are transparent
    const theme = deviceModelInternal === DeviceModelInternal.T2B1 ? '' : `_${THEME}`;

    return (
        <AnimationWrapper size={size} shape={shape} {...props}>
            {['BOOTLOADER', 'SUCCESS'].includes(type) && (
                <StyledVideo loop={loop} autoPlay muted width={size} height={size}>
                    <source
                        src={resolveStaticPath(
                            `videos/device/trezor_${deviceModelInternal}_${type.toLowerCase()}${theme}.webm`,
                        )}
                        type="video/webm"
                    />
                </StyledVideo>
            )}
            {['BOOTLOADER_TWO_BUTTONS', 'NORMAL'].includes(type) && (
                <StyledVideo loop={loop} autoPlay muted width={size} height={size}>
                    <source
                        src={resolveStaticPath(
                            `videos/device/trezor_${
                                DeviceModelInternal.T1B1
                            }_${type.toLowerCase()}${theme}.webm`,
                        )}
                        type="video/webm"
                    />
                </StyledVideo>
            )}
            {type === 'HOLOGRAM' && (
                <StyledVideo
                    loop={loop}
                    autoPlay
                    muted
                    ref={hologramRef}
                    onMouseOver={() => {
                        // If the video is placed in tooltip it stops playing after tooltip minimizes and won't start again
                        // As a quick workaround user can hover a mouse to play it again
                        hologramRef.current?.play();
                    }}
                >
                    <source
                        src={resolveStaticPath(
                            `videos/device/trezor_${deviceModelInternal}_hologram.webm`,
                        )}
                        type="video/webm"
                    />
                </StyledVideo>
            )}
        </AnimationWrapper>
    );
};
