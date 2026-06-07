/**
 * RFSpectrum — "RF / SPECTRUM" console, framed as a spectrum analyzer.
 *
 * Curates the signals slice of the 449-method science engine: rf + signal
 * processing + acoustics (sonar / frequency). Thin wrapper over the shared
 * SciDomainConsole.
 */
import SciDomainConsole from "@/components/SciDomainConsole";
import { COLORS as C } from "@/domain/colors";

export default function RFSpectrum() {
  return (
    <SciDomainConsole
      title="RF / SPECTRUM"
      subtitle="SPECTRUM ANALYZER — RF · SIGNAL · ACOUSTICS · SONAR · FREQUENCY"
      accent={C.purple}
      runLabel="ANALYZE"
      emptyHint="Select an RF / signal / acoustic method to analyze it."
      domains={["rf", "signal", "acoustics2"]}
      extraMatch={["sonar", "frequency", "doppler", "spectrum", "antenna", "fft", "filter"]}
    />
  );
}
