import styled from 'styled-components';
import { Translation } from 'src/components/suite/Translation';
import { Modal, ModalProps } from 'src/components/suite';
import { P } from '@trezor/components';
import { DeviceConfirmImage } from 'src/components/suite/images/DeviceConfirmImage';
import { TrezorDevice } from 'src/types/suite';

const Divider = styled.div`
    margin-bottom: 10px;
`;

const StyledModal = styled(Modal)`
    width: 360px;
`;

interface PinInvalidProps extends ModalProps {
    device: TrezorDevice;
}

export const PinInvalid = ({ device, ...rest }: PinInvalidProps) => (
    <StyledModal
        heading={
            <Translation id="TR_ENTERED_PIN_NOT_CORRECT" values={{ deviceLabel: device.label }} />
        }
        {...rest}
    >
        <DeviceConfirmImage device={device} />
        <Divider />
        <P size="small">
            <Translation id="TR_RETRYING_DOT_DOT" />
        </P>
    </StyledModal>
);
