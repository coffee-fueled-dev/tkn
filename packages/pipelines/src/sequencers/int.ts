import {
  isIKeyGenerator,
  KeyGenerator,
  type ISequencer,
  type ISequencerConfig,
  type ISequencerSnapshot,
  type IEmissionGate,
  type IKeyGenerator,
} from "@tkn/sequencer";

export class IntSequencer<
  TEmissionGates extends IEmissionGate[] = IEmissionGate[]
> implements ISequencer
{
  private _name: string;
  private _intsIn = 0;
  private _sequencesEmitted = 0;
  private _timeStart = 0;
  private _previousKey = 0;
  private _candidate: number[] = [];
  private _keyGenerator: IKeyGenerator;
  readonly _emissionGates: TEmissionGates;
  constructor(
    {
      name,
      gates,
      keyGenerator,
    }: ISequencerConfig<TEmissionGates> = {} as ISequencerConfig<TEmissionGates>
  ) {
    this._name = name ?? this.constructor.name;
    this._emissionGates = (gates ?? []) as TEmissionGates;

    this._keyGenerator = isIKeyGenerator(keyGenerator)
      ? keyGenerator
      : new KeyGenerator(keyGenerator);
  }

  push(int: number): number[] | void {
    this._previousKey = this._keyGenerator.value;

    this._intsIn++;
    this._candidate.push(int);
    this._keyGenerator.update(int);

    return this._evaluateGates();
  }

  private _evaluateGates = (): number[] | void => {
    for (let index = 0; index < this._emissionGates.length; index++) {
      const gate = this._emissionGates[index];
      if (!gate.evaluate(this._keyGenerator.value, this._previousKey)) {
        const panicTrigger = this._candidate.pop()!; // The last int added caused the gate to fail
        const previous = this._candidate.slice(); // Now candidate is previous
        this._sequencesEmitted++;
        this._keyGenerator.recalculate([panicTrigger]);
        this._candidate = [panicTrigger];
        return previous;
      }
    }
  };

  flush(): number[][] {
    return [this._candidate];
  }

  reset = (): void => {
    this._candidate = [];
    this._intsIn = 0;
    this._sequencesEmitted = 0;
    this._timeStart = 0;
    this._emissionGates.forEach((gate) => gate.reset());
  };

  async snapshot(): Promise<ISequencerSnapshot[]> {
    return [
      {
        name: this._name,
        gates: await Promise.all(
          this._emissionGates.map(
            async (gate) =>
              (await gate.snapshot()) ?? {
                name: gate.constructor.name,
                ingested: 0,
                passRate: 0,
              }
          )
        ),
        intsIn: this._intsIn,
        sequencesEmitted: this._sequencesEmitted,
        durationMS: performance.now() - this._timeStart,
        intsPerEmit: this.intsPerEmit,
      },
    ];
  }

  get bytesIn(): number {
    return this._candidate.length;
  }

  get sequencesEmitted(): number {
    return this._sequencesEmitted;
  }

  get intsPerEmit(): number {
    return this._intsIn / this._sequencesEmitted;
  }

  get durationMS(): number {
    return performance.now() - this._timeStart;
  }
}
