export type ObjType = { [key: string]: unknown };
export const validateSpec = <T>(
	spec: any,
	data: ObjType,
	optionalConfig = {}
): T => {
	try {
		const value = spec.parse(data, {
			allowUnknown: true,
			stripUnknown: true,
			errors: {
				wrap: {
					label: "",
				},
			},
			...optionalConfig,
		});
		return value;
	} catch (error) {
		throw error;
	}
};
