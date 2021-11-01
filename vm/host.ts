import handleInterruption from "./interruptions/handleInterruption";
import type {ExecutionOutput, INTERRUPT_ARGUMENT, VMInterface} from "./types";

export const run = async (vm: VMInterface, handler: ({type, payload}: {type: INTERRUPT_ARGUMENT, payload: Record<string, any>})=>any = handleInterruption): Promise<ExecutionOutput>=>{
    let lastResult: ExecutionOutput = vm.run();
    while (lastResult.interruption) {
        const result: any = await handler(lastResult.interruption);
        vm.write(result);
        lastResult = vm.run();
    }
    return lastResult;
}