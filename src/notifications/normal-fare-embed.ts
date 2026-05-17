import type { DiscordEmbed, NormalizedFareObservation } from "../types/domain.js";

export interface NormalFarePriceComparison {
  thirdLowestPriceAmountMinor?: number;
  historicalLowestPriceAmountMinor?: number;
}

export function buildNormalFareEmbed(
  fare: NormalizedFareObservation,
  comparison: NormalFarePriceComparison = {}
): DiscordEmbed {
  let airlineText = 'Unknown Airline';
  try {
    // 這裡的 fare.flights 就是你在資料庫看到的那串 JSON
    const flightData = typeof fare.flights === 'string' 
      ? JSON.parse(fare.flights) 
      : fare.flights;

    // 判斷它是單純的陣列，還是外層包了物件的結構（相容兩種情況）
    const flightList = Array.isArray(flightData) 
      ? flightData 
      : (flightData?.flights || []);

    if (Array.isArray(flightList) && flightList.length > 0) {
      // 把所有航班的 airline 抓出來並過濾重複（例如去回程都是 Jetstar 就只顯示一個）
      const uniqueAirlines = [...new Set(flightList.map((f: any) => f.airline).filter(Boolean))];
      if (uniqueAirlines.length > 0) {
        airlineText = uniqueAirlines.join(' + '); // 如果去回程不同航空，會變 "Jetstar + Peach"
      }
    }
  } catch (e) {
    console.error('Failed to parse flight details for airline text', e);
  }
  
  return {
    title: `Cheap fare found: ${fare.originAirportCode} -> ${fare.destinationAirportCode}`,
    description: buildDescription(comparison),
    url: fare.deepLink,
    color: 0x2ecc71,
    fields: [
      { name: "Price", value: formatMoney(fare.currencyCode, fare.priceAmountMinor), inline: true },
      { name: 'Airline', value: airlineText },
      { name: "Trip", value: fare.tripType, inline: true },
      { name: "Cabin", value: fare.cabinClass, inline: true },
      { name: "Source", value: buildSourceLabel(fare), inline: true },
      { name: "Departure", value: fare.departDate ?? "unknown", inline: true },
      { name: "Return", value: fare.returnDate ?? "unknown", inline: true },
      { name: "Price vs history", value: buildPriceComparison(fare, comparison), inline: false }
    ],
    timestamp: fare.observedAt
  };
}

function buildDescription(comparison: NormalFarePriceComparison): string {
  if (typeof comparison.thirdLowestPriceAmountMinor === "number") {
    return "New fare entered the historical top 3 for this destination.";
  }

  return "New fare found while historical baseline is still being built.";
}

function buildSourceLabel(fare: NormalizedFareObservation): string {
  return fare.providerQueryKey;
}

function buildPriceComparison(
  fare: NormalizedFareObservation,
  comparison: NormalFarePriceComparison
): string {
  const lines: string[] = [];

  if (typeof comparison.historicalLowestPriceAmountMinor === "number") {
    const delta = fare.priceAmountMinor - comparison.historicalLowestPriceAmountMinor;
    const sign = delta <= 0 ? "below" : "above";
    lines.push(
      `Lowest seen: ${formatMoney(fare.currencyCode, comparison.historicalLowestPriceAmountMinor)} (${formatMoney(fare.currencyCode, Math.abs(delta))} ${sign})`
    );
  }

  if (typeof comparison.thirdLowestPriceAmountMinor === "number") {
    const delta = comparison.thirdLowestPriceAmountMinor - fare.priceAmountMinor;
    const percentage = comparison.thirdLowestPriceAmountMinor > 0
      ? ((delta / comparison.thirdLowestPriceAmountMinor) * 100).toFixed(1)
      : "0.0";

    lines.push(
      `Top-3 threshold: ${formatMoney(fare.currencyCode, comparison.thirdLowestPriceAmountMinor)} (${formatMoney(fare.currencyCode, Math.abs(delta))} cheaper, ${percentage}% below)`
    );
  }

  if (lines.length === 0) {
    return "Not enough historical fares yet.";
  }

  return lines.join("\n");
}

function formatMoney(currencyCode: string, amountMinor: number): string {
  return `${currencyCode} ${(amountMinor / 100).toFixed(2)}`;
}
