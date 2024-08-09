const ActivityType = {
  PermanentStake: 0,
  Stake: 1,
  Withdraw: 2,
  Lock: 3,
  Unlock: 4,
};

const Events = {
  TokenActivity: 'TokenActivity',
  GracePeriodStarted: 'GracePeriodStarted',
};

const Errors = {
  InsufficientAmount: 'InsufficientAmount',
  NonWithdrawableTokens: 'NonWithdrawableTokens',
  GracePeriodNotFinished: 'GracePeriodNotFinished',
  UnlockPeriodNotFinished: 'UnlockPeriodNotFinished',
  ExistentTokensToClaim: 'ExistentTokensToClaim',
  AmountExceedsAvailableWithdraw: 'AmountExceedsAvailableWithdraw',
};

const MethodSignatures = {
  WithdrawImediately: 'withdraw(uint256)',
  WithdrawWithGracePeriod: 'withdraw(bool)',
  UnlockImediately: 'unlock(uint256)',
  UnlockWithGracePeriod: 'unlock(bool)',
};

const TimePeriods = {
  FOUR_WEEKS: 4 * 7 * 24 * 60 * 60,
  TWO_YEARS: 63_158_400, //2 years considering leap years in seconds,
};

function generateCurrencies() {
  const numberWords = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'];
  const currencyObject = {};

  numberWords.forEach((word, index) => {
    const key = `${word}_ETHER`;
    const value = index + 1;
    currencyObject[key] = ethers.utils.parseEther(value.toString());
  });

  return currencyObject;
}

module.exports = {
  Events,
  Errors,
  TimePeriods,
  ActivityType,
  MethodSignatures,
  Currencies: generateCurrencies(),
};
