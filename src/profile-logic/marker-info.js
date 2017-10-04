// @flow

/**
 * This is the description for various bailout marker events. It would be nice to keep
 * this up to date with Gecko. It might be possible to send this information with
 * the markers themselves. While it is still in the front-end, it can be updated with
 * porting a diff from this permalink:
 *
 * http://searchfox.org/mozilla-central/rev/a4702203522745baff21e519035b6c946b7d710d/js/src/jit/IonTypes.h
 */
export const bailoutTypeInformation = {
  Bailout_Inevitable:
    'An inevitable bailout (MBail instruction or type barrier that always bails)',
  Bailout_DuringVMCall:
    'Bailing out during a VM call. Many possible causes that are hard ' +
    'to distinguish statically at snapshot construction time. ' +
    'We just lump them together.',
  Bailout_NonJSFunctionCallee: 'Call to a non-JSFunction (problem for |apply|)',
  Bailout_DynamicNameNotFound:
    'Dynamic scope chain lookup produced |undefined|',
  Bailout_StringArgumentsEval: "Input string contains 'arguments' or 'eval'",
  Bailout_Overflow:
    "Bailout on overflow, but don't immediately invalidate. " +
    'Used for abs, sub and LoadUnboxedScalar (when loading a uint32 that ' +
    "doesn't fit in an int32).",
  Bailout_Round:
    'floor, ceiling and round bail if input is NaN, if output would be -0 or ' +
    "doesn't fit in int32 range",
  Bailout_NonPrimitiveInput:
    'Non-primitive value used as input for ToDouble, ToInt32, ToString, etc. ' +
    "For ToInt32, can also mean that input can't be converted without precision " +
    'loss (e.g. 5.5).',
  Bailout_PrecisionLoss:
    'For ToInt32, would lose precision when converting (e.g. 5.5).',
  Bailout_TypeBarrierO:
    'We tripped a type barrier (object was not in the expected TypeSet)',
  Bailout_TypeBarrierV:
    'We tripped a type barrier (value was not in the expected TypeSet)',
  Bailout_MonitorTypes:
    'We tripped a type monitor (wrote an unexpected type in a property)',
  Bailout_Hole: 'We hit a hole in an array.',
  Bailout_NegativeIndex: 'Array access with negative index',
  Bailout_ObjectIdentityOrTypeGuard:
    'Pretty specific case:\n' +
    ' - need a type barrier on a property write\n' +
    ' - all but one of the observed types have property types that reflect the value\n' +
    " - we need to guard that we're not given an object of that one other type\n" +
    'also used for the unused GuardClass instruction\n',
  Bailout_NonInt32Input:
    "Unbox expects a given type, bails out if it doesn't get it.",
  Bailout_NonNumericInput:
    "Unbox expects a given type, bails out if it doesn't get it. " +
    'unboxing a double works with int32 too',
  Bailout_NonBooleanInput:
    "Unbox expects a given type, bails out if it doesn't get it.",
  Bailout_NonObjectInput:
    "Unbox expects a given type, bails out if it doesn't get it.",
  Bailout_NonStringInput:
    "Unbox expects a given type, bails out if it doesn't get it.",
  Bailout_NonSymbolInput:
    "Unbox expects a given type, bails out if it doesn't get it.",
  Bailout_UnexpectedSimdInput:
    "SIMD Unbox expects a given type, bails out if it doesn't match.",
  Bailout_NonSharedTypedArrayInput:
    'Atomic operations require shared memory, bail out if the typed array ' +
    'maps unshared memory.',
  Bailout_Debugger: 'We hit a |debugger;| statement.',
  Bailout_UninitializedThis:
    '|this| used uninitialized in a derived constructor',
  Bailout_BadDerivedConstructorReturn:
    'Derived constructors must return object or undefined',
  Bailout_FirstExecution: 'We hit this code for the first time.',
  Bailout_OverflowInvalidate:
    'Like Bailout_Overflow, but causes immediate invalidation.',
  Bailout_NonStringInputInvalidate:
    'Like NonStringInput, but should cause immediate invalidation. ' +
    'Used for jsop_iternext.',
  Bailout_DoubleOutput:
    'Used for integer division, multiplication and modulo. ' +
    "If there's a remainder, bails to return a double. " +
    'Can also signal overflow or result of -0. ' +
    'Can also signal division by 0 (returns inf, a double).',
  Bailout_ArgumentCheck:
    'A bailout at the very start of a function indicates that there may be ' +
    'a type mismatch in the arguments that necessitates a reflow.',
  Bailout_BoundsCheck: 'A bailout triggered by a bounds-check failure.',
  Bailout_Detached:
    'A bailout triggered by a typed object whose backing buffer was detached.',
  Bailout_ShapeGuard:
    'A shape guard based on TI information failed. ' +
    '(We saw an object whose shape does not match that / any of those observed ' +
    'by the baseline IC.)',
  Bailout_UninitializedLexical:
    "When we're trying to use an uninitialized lexical.",
  Bailout_IonExceptionDebugMode:
    'A bailout to baseline from Ion on exception to handle Debugger hooks.',
};
