import { bindings } from 'src/bindings';
import { MonitorService } from 'src/logic/MonitorService';

export async function monitor() {
  let service: MonitorService | null = null;
  service = bindings.get(MonitorService);
  await service.saveDataToGoogleSheet();
}
