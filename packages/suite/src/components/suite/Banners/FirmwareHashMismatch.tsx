import { Banner } from './Banner';
import { Translation } from 'src/components/suite';

const FirmwareHashMismatch = () => (
    <Banner variant="critical" body={<Translation id="TR_FIRMWARE_HASH_MISMATCH" />} />
);

export default FirmwareHashMismatch;
