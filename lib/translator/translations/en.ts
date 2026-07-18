export const EN_TRANSLATIONS = {
  sac: {
    transfer: (from: string, amount: string, symbol: string, to: string) =>
      `Public Key [${from}] transferred ${amount} ${symbol} to [${to}]`,
    mint: (admin: string, amount: string, symbol: string, to: string) =>
      `Admin [${admin}] minted ${amount} ${symbol} to [${to}]`,
    burn: (from: string, amount: string, symbol: string) =>
      `Public Key [${from}] burned ${amount} ${symbol}`,
    eventTypes: {
      Transfer: "Transfer",
      Mint: "Mint",
      Burn: "Burn",
    },
  },
  sdex: {
    manageBuyOffer: (seller: string, amount: string, buyingAsset: string, sellingAsset: string) =>
      `Account [${seller}] placed a buy offer for ${amount} of asset [${buyingAsset}], offering asset [${sellingAsset}]`,
    manageSellOffer: (seller: string, amount: string, sellingAsset: string, buyingAsset: string) =>
      `Account [${seller}] placed a sell offer for ${amount} of asset [${sellingAsset}], requesting asset [${buyingAsset}]`,
    offerFilled: (seller: string, amount: string, assetSold: string, buyer: string) =>
      `Offer from [${seller}] was filled: ${amount} of asset [${assetSold}] was sold to [${buyer}]`,
    eventTypes: {
      ManageBuyOffer: "Manage Buy Offer",
      ManageSellOffer: "Manage Sell Offer",
      OfferFilled: "Offer Filled",
    },
  },
};
