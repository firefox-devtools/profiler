// flow-typed signature: 288f4faaf6ac0b27e40f4c72e23188f8
// flow-typed version: 387a235736/react-redux_v7.x.x/flow_>=v0.89.x <=v0.103.x

/**
The order of type arguments for connect() is as follows:

connect<Props, OwnProps, StateProps, DispatchProps, State, Dispatch>(…)

In Flow v0.89 only the first two are mandatory to specify. Other 4 can be repaced with the new awesome type placeholder:

connect<Props, OwnProps, _, _, _, _>(…)

But beware, in case of weird type errors somewhere in random places
just type everything and get to a green field and only then try to
remove the definitions you see bogus.

Decrypting the abbreviations:
  WC = Component being wrapped
  S = State
  D = Dispatch
  OP = OwnProps
  SP = StateProps
  DP = DispatchProps
  MP = Merge props
  RSP = Returned state props
  RDP = Returned dispatch props
  RMP = Returned merge props
  CP = Props for returned component
  Com = React Component
  SS = Selected state
  ST = Static properties of Com
  EFO = Extra factory options (used only in connectAdvanced)
*/

import type { State, PlainDispatch, ConnectedProps } from 'firefox-profiler/types';

declare module "react-redux" {
  // ------------------------------------------------------------
  // Typings for connect()
  // ------------------------------------------------------------

  declare export type Options<S, OP, SP, MP> = {|
    pure?: boolean,
    forwardRef?: boolean,
    areStatesEqual?: (next: S, prev: S) => boolean,
    areOwnPropsEqual?: (next: OP, prev: OP) => boolean,
    areStatePropsEqual?: (next: SP, prev: SP) => boolean,
    areMergedPropsEqual?: (next: MP, prev: MP) => boolean,
    storeKey?: string,
  |};

  declare type MapStateToProps<-S, -OP, +SP> =
    | ((state: S, ownProps: OP) => SP)
    // If you want to use the factory function but get a strange error
    // like "function is not an object" then just type the factory function
    // like this:
    // const factory: (State, OwnProps) => (State, OwnProps) => StateProps
    // and provide the StateProps type to the SP type parameter.
    | ((state: S, ownProps: OP) => (state: S, ownProps: OP) => SP);

  declare type Bind<D> = <A, R>((...A) => R) => (...A) => $Call<D, R>;

  declare type MapDispatchToPropsFn<D, -OP, +DP> =
    | ((dispatch: D, ownProps: OP) => DP)
    // If you want to use the factory function but get a strange error
    // like "function is not an object" then just type the factory function
    // like this:
    // const factory: (Dispatch, OwnProps) => (Dispatch, OwnProps) => DispatchProps
    // and provide the DispatchProps type to the DP type parameter.
    | ((dispatch: D, ownProps: OP) => (dispatch: D, ownProps: OP) => DP);

  declare class ConnectedComponent<OP, +WC> extends React$Component<OP> {
    static +WrappedComponent: WC;
    getWrappedInstance(): React$ElementRef<WC>;
  }
  // The connection of the Wrapped Component and the Connected Component
  // happens here in `MP: P`. It means that type wise MP belongs to P,
  // so to say MP >= P.
  declare type Connector<P, OP, MP: P> = <WC: React$ComponentType<P>>(
    WC,
  ) => Class<ConnectedComponent<OP, WC>> & WC;

  // No `mergeProps` argument

  // Got error like inexact OwnProps is incompatible with exact object type?
  // Just make the OP parameter for `connect()` an exact object.
  declare type MergeOP<OP, D> = {| ...$Exact<OP>, dispatch: D |};
  declare type MergeOPSP<OP, SP, D> = {| ...$Exact<OP>, ...SP, dispatch: D |};
  declare type MergeOPDP<OP, DP> = {| ...$Exact<OP>, ...DP |};
  declare type MergeOPSPDP<OP, SP, DP> = {| ...$Exact<OP>, ...SP, ...DP |};

  declare export function connect<-OP, -SP, -DP>(
    mapStateToProps?: null | void,
    mapDispatchToProps?: null | void,
    mergeProps?: null | void,
    options?: ?Options<State, OP, {||}, MergeOP<OP, PlainDispatch>>,
  ): Connector<ConnectedProps<OP, SP, DP>, OP, MergeOP<OP, PlainDispatch>>;

  declare export function connect<-OP, -SP, -DP>(
    // If you get error here try adding return type to your mapStateToProps function
    mapStateToProps: MapStateToProps<State, OP, SP>,
    mapDispatchToProps?: null | void,
    mergeProps?: null | void,
    options?: ?Options<State, OP, SP, MergeOPSP<OP, SP, PlainDispatch>>,
  ): Connector<ConnectedProps<OP, SP, DP>, OP, MergeOPSP<OP, SP, PlainDispatch>>;

  // In this case DP is an object of functions which has been bound to dispatch
  // by the given mapDispatchToProps function.
  declare export function connect<-OP, -SP, -DP>(
    mapStateToProps: null | void,
    mapDispatchToProps: MapDispatchToPropsFn<PlainDispatch, OP, DP>,
    mergeProps?: null | void,
    options?: ?Options<State, OP, {||}, MergeOPDP<OP, DP>>,
  ): Connector<ConnectedProps<OP, SP, DP>, OP, MergeOPDP<OP, DP>>;

  // In this case DP is an object of action creators not yet bound to dispatch,
  // this difference is not important in the vanila redux,
  // but in case of usage with redux-thunk, the return type may differ.
  declare export function connect<-OP, -SP, -DP>(
    mapStateToProps: null | void,
    mapDispatchToProps: DP,
    mergeProps?: null | void,
    options?: ?Options<State, OP, {||}, MergeOPDP<OP, DP>>,
  ): Connector<ConnectedProps<OP, SP, DP>, OP, MergeOPDP<OP, $ObjMap<DP, Bind<PlainDispatch>>>>;

  declare export function connect<-OP, -SP, -DP>(
    // If you get error here try adding return type to your mapStateToProps function
    mapStateToProps: MapStateToProps<State, OP, SP>,
    mapDispatchToProps: MapDispatchToPropsFn<PlainDispatch, OP, DP>,
    mergeProps?: null | void,
    options?: ?Options<State, OP, SP, {| ...OP, ...SP, ...DP |}>,
  ): Connector<ConnectedProps<OP, SP, DP>, OP, {| ...OP, ...SP, ...DP |}>;

  declare export function connect<-OP, -SP, -DP>(
    // If you get error here try adding return type to your mapStateToProps function
    mapStateToProps: MapStateToProps<State, OP, SP>,
    mapDispatchToProps: DP,
    mergeProps?: null | void,
    options?: ?Options<State, OP, SP, MergeOPSPDP<OP, SP, DP>>,
  ): Connector<ConnectedProps<OP, SP, DP>, OP, MergeOPSPDP<OP, SP, $ObjMap<DP, Bind<PlainDispatch>>>>;

  // With `mergeProps` argument

  declare type MergeProps<+P, -OP, -SP, -DP> = (
    stateProps: SP,
    dispatchProps: DP,
    ownProps: OP,
  ) => P;

  declare export function connect<-OP, -SP: {||}, -DP: {||}>(
    mapStateToProps: null | void,
    mapDispatchToProps: null | void,
    // If you get error here try adding return type to you mapStateToProps function
    mergeProps: MergeProps<ConnectedProps<OP, SP, DP>, OP, {||}, {| dispatch: PlainDispatch |}>,
    options?: ?Options<State, OP, {||}, ConnectedProps<OP, SP, DP>>,
  ): Connector<ConnectedProps<OP, SP, DP>, OP, ConnectedProps<OP, SP, DP>>;

  declare export function connect<-OP, -SP, -DP: {||}>(
    mapStateToProps: MapStateToProps<State, OP, SP>,
    mapDispatchToProps: null | void,
    // If you get error here try adding return type to you mapStateToProps function
    mergeProps: MergeProps<ConnectedProps<OP, SP, DP>, OP, SP, {| dispatch: PlainDispatch |}>,
    options?: ?Options<State, OP, SP, ConnectedProps<OP, SP, DP>>,
  ): Connector<ConnectedProps<OP, SP, DP>, OP, ConnectedProps<OP, SP, DP>>;

  // In this case DP is an object of functions which has been bound to dispatch
  // by the given mapDispatchToProps function.
  declare export function connect<-OP, -SP: {||}, -DP>(
    mapStateToProps: null | void,
    mapDispatchToProps: MapDispatchToPropsFn<PlainDispatch, OP, DP>,
    mergeProps: MergeProps<ConnectedProps<OP, SP, DP>, OP, {||}, DP>,
    options?: ?Options<State, OP, {||}, ConnectedProps<OP, SP, DP>>,
  ): Connector<ConnectedProps<OP, SP, DP>, OP, ConnectedProps<OP, SP, DP>>;

  // In this case DP is an object of action creators not yet bound to dispatch,
  // this difference is not important in the vanila redux,
  // but in case of usage with redux-thunk, the return type may differ.
  declare export function connect<-OP, -SP: {||}, -DP>(
    mapStateToProps: null | void,
    mapDispatchToProps: DP,
    mergeProps: MergeProps<ConnectedProps<OP, SP, DP>, OP, {||}, $ObjMap<DP, Bind<PlainDispatch>>>,
    options?: ?Options<State, OP, {||}, ConnectedProps<OP, SP, DP>>,
  ): Connector<ConnectedProps<OP, SP, DP>, OP, ConnectedProps<OP, SP, DP>>;

  // In this case DP is an object of functions which has been bound to dispatch
  // by the given mapDispatchToProps function.
  declare export function connect<-OP, -SP, -DP>(
    mapStateToProps: MapStateToProps<State, OP, SP>,
    mapDispatchToProps: MapDispatchToPropsFn<PlainDispatch, OP, DP>,
    mergeProps: MergeProps<ConnectedProps<OP, SP, DP>, OP, SP, DP>,
    options?: ?Options<State, OP, SP, ConnectedProps<OP, SP, DP>>,
  ): Connector<ConnectedProps<OP, SP, DP>, OP, ConnectedProps<OP, SP, DP>>;

  // In this case DP is an object of action creators not yet bound to dispatch,
  // this difference is not important in the vanila redux,
  // but in case of usage with redux-thunk, the return type may differ.
  declare export function connect<-OP, -SP, -DP>(
    mapStateToProps: MapStateToProps<State, OP, SP>,
    mapDispatchToProps: DP,
    mergeProps: MergeProps<ConnectedProps<OP, SP, DP>, OP, SP, $ObjMap<DP, Bind<PlainDispatch>>>,
    options?: ?Options<State, OP, SP, ConnectedProps<OP, SP, DP>>,
  ): Connector<ConnectedProps<OP, SP, DP>, OP, ConnectedProps<OP, SP, DP>>;

  // ------------------------------------------------------------
  // Typings for Hooks
  // ------------------------------------------------------------

  declare export function useDispatch<D>(): D;

  declare export function useSelector<S, SS>(
    selector: (state: S) => SS,
    equalityFn?: (a: SS, b: SS) => boolean,
  ): SS;

  declare export function useStore<Store>(): Store;

  // ------------------------------------------------------------
  // Typings for Provider
  // ------------------------------------------------------------

  declare export class Provider<Store> extends React$Component<{
    store: Store,
    children?: React$Node,
  }> {}

  declare export function createProvider(
    storeKey?: string,
    subKey?: string,
  ): Class<Provider<*>>;

  // ------------------------------------------------------------
  // Typings for connectAdvanced()
  // ------------------------------------------------------------

  declare type ConnectAdvancedOptions = {
    getDisplayName?: (name: string) => string,
    methodName?: string,
    renderCountProp?: string,
    shouldHandleStateChanges?: boolean,
    storeKey?: string,
    forwardRef?: boolean,
  };

  declare type SelectorFactoryOptions<Com> = {
    getDisplayName: (name: string) => string,
    methodName: string,
    renderCountProp: ?string,
    shouldHandleStateChanges: boolean,
    storeKey: string,
    forwardRef: boolean,
    displayName: string,
    wrappedComponentName: string,
    WrappedComponent: Com,
  };

  declare type MapStateToPropsEx<S: Object, SP: Object, RSP: Object> = (
    state: S,
    props: SP,
  ) => RSP;

  declare type SelectorFactory<
    Com: React$ComponentType<*>,
    Dispatch,
    S: Object,
    OP: Object,
    EFO: Object,
    CP: Object,
  > = (
    dispatch: Dispatch,
    factoryOptions: SelectorFactoryOptions<Com> & EFO,
  ) => MapStateToPropsEx<S, OP, CP>;

  declare export function connectAdvanced<
    Com: React$ComponentType<*>,
    D,
    S: Object,
    OP: Object,
    CP: Object,
    EFO: Object,
    ST: { [_: $Keys<Com>]: any },
  >(
    selectorFactory: SelectorFactory<Com, D, S, OP, EFO, CP>,
    connectAdvancedOptions: ?(ConnectAdvancedOptions & EFO),
  ): (component: Com) => React$ComponentType<OP> & $Shape<ST>;

  declare export function batch(() => void): void

  declare export default {
    Provider: typeof Provider,
    createProvider: typeof createProvider,
    connect: typeof connect,
    connectAdvanced: typeof connectAdvanced,
    useDispatch: typeof useDispatch,
    useSelector: typeof useSelector,
    useStore: typeof useStore,
    batch: typeof batch,
  };
}
