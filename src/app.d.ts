declare global {
	namespace App {}
	interface Navigator {
		/** Safari 16.4+: тип аудіосесії, 'playback' грає і в беззвучному режимі */
		audioSession?: { type: string };
	}
}

export {};
