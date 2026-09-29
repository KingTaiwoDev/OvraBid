/**
 * OvraBid test simulator.
 *
 * Runs the compiled circuits entirely in-process (no network, no prover):
 * the same testbed pattern as the Midnight example contracts (counter,
 * bboard), adapted for multi-participant auctions.
 *
 * Multi-participant model: every simulator forked from the same origin
 * shares one `family` cell holding the LATEST circuit context (the public
 * ledger state). Before each circuit call a simulator adopts the family's
 * latest context but substitutes its own private state (secret key), and
 * after the call it publishes the resulting context back to the family.
 * This mirrors how independent users interleave transactions on one chain.
 */
import {
  type CircuitContext,
  QueryContext,
  sampleContractAddress,
  createConstructorContext,
  CostModel,
} from '@midnight-ntwrk/compact-runtime';
import { Contract, type Ledger, ledger } from '../contracts/managed/ovraBid/contract/index.js';
import { type OvraBidPrivateState, witnesses } from '../src/witnesses.js';

/** Shared cell holding the latest public state for one auction "chain". */
interface Family {
  latest: CircuitContext<OvraBidPrivateState>;
}

export class OvraBidSimulator {
  readonly contract: Contract<OvraBidPrivateState>;
  private family: Family;
  private secretKey: Uint8Array;

  private constructor(
    contract: Contract<OvraBidPrivateState>,
    family: Family,
    secretKey: Uint8Array,
  ) {
    this.contract = contract;
    this.family = family;
    this.secretKey = secretKey;
  }

  /** Creates the origin simulator (and its family) for a participant. */
  public static async create(secretKey: Uint8Array): Promise<OvraBidSimulator> {
    const contract = new Contract<OvraBidPrivateState>(witnesses);
    const {
      currentPrivateState,
      currentContractState,
      currentZswapLocalState,
    } = await contract.initialState(
      createConstructorContext({ secretKey }, '0'.repeat(64)),
    );
    const context: CircuitContext<OvraBidPrivateState> = {
      currentPrivateState,
      currentZswapLocalState,
      costModel: CostModel.initialCostModel(),
      currentQueryContext: new QueryContext(
        currentContractState.data,
        sampleContractAddress(),
      ),
    };
    return new OvraBidSimulator(contract, { latest: context }, secretKey);
  }

  /** Creates another participant on the same public ledger state. */
  public static forkFrom(other: OvraBidSimulator, secretKey: Uint8Array): OvraBidSimulator {
    return new OvraBidSimulator(other.contract, other.family, secretKey);
  }

  /** Switch this simulator's participant to a different secret key. */
  public switchUser(secretKey: Uint8Array): void {
    this.secretKey = secretKey;
  }

  /**
   * The context this simulator would use for its next circuit call: the
   * family's latest public state, with this participant's private state.
   */
  private nextContext(): CircuitContext<OvraBidPrivateState> {
    return {
      ...this.family.latest,
      currentPrivateState: { secretKey: this.secretKey },
    };
  }

  /** Runs one impure circuit as this participant, then publishes the result. */
  private async run<R>(
    circuit: (ctx: CircuitContext<OvraBidPrivateState>) => { context: CircuitContext<OvraBidPrivateState>; result: R },
  ): Promise<{ ledger: Ledger; result: R }> {
    const res = circuit(this.nextContext());
    this.family.latest = res.context;
    return { ledger: ledger(res.context.currentQueryContext.state), result: res.result };
  }

  public getLedger(): Ledger {
    return ledger(this.family.latest.currentQueryContext.state);
  }

  public getPrivateState(): OvraBidPrivateState {
    return { secretKey: this.secretKey };
  }

  public async startAuction(): Promise<Ledger> {
    return (await this.run((c) => this.contract.impureCircuits.startAuction(c))).ledger;
  }

  public async commitBid(amount: bigint, salt: Uint8Array): Promise<Ledger> {
    return (await this.run((c) => this.contract.impureCircuits.commitBid(c, amount, salt))).ledger;
  }

  public async endCommitPhase(): Promise<Ledger> {
    return (await this.run((c) => this.contract.impureCircuits.endCommitPhase(c))).ledger;
  }

  public async openBestBid(amount: bigint, salt: Uint8Array): Promise<Ledger> {
    return (await this.run((c) => this.contract.impureCircuits.openBestBid(c, amount, salt))).ledger;
  }

  public async registerAsWinner(amount: bigint, salt: Uint8Array): Promise<Ledger> {
    return (await this.run((c) => this.contract.impureCircuits.registerAsWinner(c, amount, salt))).ledger;
  }

  public async claimWin(): Promise<{ ledger: Ledger; price: bigint }> {
    const { ledger: l, result } = await this.run((c) => this.contract.impureCircuits.claimWin(c));
    return { ledger: l, price: result };
  }

  public async settle(): Promise<Ledger> {
    return (await this.run((c) => this.contract.impureCircuits.settle(c))).ledger;
  }
}
