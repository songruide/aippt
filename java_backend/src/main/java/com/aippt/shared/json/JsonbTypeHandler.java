package com.aippt.shared.json;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JavaType;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * MySQL JSON 列与 Java 对象之间的转换。
 *
 * MySQL 驱动可直接把 JSON 文本按字符串写入 JSON 列，读取时也返回字符串，
 * 因此不需要 PostgreSQL 时代的 PGobject 包装。
 */
public class JsonbTypeHandler<T> extends BaseTypeHandler<T> {

    private static final ObjectMapper MAPPER = JsonMapperHolder.MAPPER;
    private final JavaType javaType;

    public JsonbTypeHandler(Class<T> type) {
        this.javaType = MAPPER.getTypeFactory().constructType(type);
    }

    public JsonbTypeHandler(Class<T> type, Class<?>... parameterClasses) {
        this.javaType = MAPPER.getTypeFactory().constructParametricType(type, parameterClasses);
    }

    public JsonbTypeHandler(JavaType javaType) {
        this.javaType = javaType;
    }

    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, T parameter, JdbcType jdbcType) throws SQLException {
        try {
            ps.setString(i, MAPPER.writeValueAsString(parameter));
        } catch (JsonProcessingException ex) {
            throw new SQLException("JSON 序列化失败", ex);
        }
    }

    @Override
    public T getNullableResult(ResultSet rs, String columnName) throws SQLException {
        return parse(rs.getString(columnName));
    }

    @Override
    public T getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        return parse(rs.getString(columnIndex));
    }

    @Override
    public T getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        return parse(cs.getString(columnIndex));
    }

    private T parse(String json) throws SQLException {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            return MAPPER.readValue(json, javaType);
        } catch (JsonProcessingException ex) {
            throw new SQLException("JSON 反序列化失败", ex);
        }
    }
}
