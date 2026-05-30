export interface RegistrationEventParams {
    id: bigint;
    code: string;
    auth: string;
}

export interface ToggleEventParams {
    id: bigint;
    active: boolean;
}

export type BlockchainEventType = 
    | 'RTOReg' | 'RTOStatusToggled'
    | 'MfgReg' | 'MfgToggled'
    | 'ScrapReg' | 'ScrapToggled'
    | 'PoliceReg' | 'PoliceStatusToggled'
    | 'InsReg' | 'InsStatusToggled'
    | 'CenterReg' | 'CenterStatusToggled'
    | 'BankReg' | 'BankStatusToggled'
    | 'ExecutionSuccess' | 'ExecutionFailure';
