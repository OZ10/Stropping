package com.oz10.stropping;

import android.content.Intent;
import android.os.Bundle;
import android.support.design.widget.FloatingActionButton;
import android.support.design.widget.Snackbar;
import android.support.v7.app.ActionBar;
import android.support.v7.app.AppCompatActivity;
import android.support.v7.widget.Toolbar;
import android.view.Menu;
import android.view.MenuInflater;
import android.view.MenuItem;
import android.view.View;
import android.widget.EditText;
import android.widget.TextView;

import com.adapters.database.StroppingDatabase;
import com.classes.Ingredient;

public class IngredientEditActivity extends AppCompatActivity {

    Spinner _uomSpinner;
    Ingredient _ingredient;
    EditText _ingredientName;
    EditText _quantity;
    Swtich _favourite;
    Swtich _essential

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_ingredient_edit);

        SetupActionbar();

        _ingredientName = (EditText) findViewById(R.id.ingredient_edit_name);
        _quantity = (EditText) findViewById(R.id.ingredient_edit_quantity_value);
        SetupUOMSpinner();
        _favourite = (Switch) findViewById(R.id.ingredient_edit_favourite);
        _essential = (Switch) findViewById(R.id.ingredient_edit_essential);

        Intent intent = getIntent();
        if (intent != null){
            Long ingredientId = intent.getLongExtra("IngredientId", 0);

            if (ingredientId != 0){
                StroppingDatabase db = new StroppingDatabase(this);
                db.open();

                _ingredient = db.getIngredientFromId(ingredientId);
                
                _ingredientName.setText(_ingredient.getName());
                _quantity.setText(String.valueof(_ingredient.getQuantity()));
                
                //_uomSpinner.setSelection(index);
                
                _favourite.setChecked(_ingredient.getFavourite);
                _essential.setChecked(_ingredient.getEssential);

                db.close();
            } else {
                _ingredient = new Ingredient();
            }

        }
    }
    
    private void SetupUOMSpinner()
    {
        //TODO Load these values from db
        List<String> uomList = new ArrayList<String();
        uomList.add("number of");
        uomList.add("grams");
        uomList.add("kilograms");
        uomList.add("liters");
        uomList.add("milliliters");
        uomList.add("pints");
        
        ArrayAdapter<String> adapter = new ArrayAdapter<String>(this, android.R.layout.simple_spinner_item, uomList)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        
        _uomSpinner = (Spinner) findViewById(R.id.ingredient_edit_uom);
        _uomSpinner.setAdapter(adapter);
        
    }

    private void SetupActionbar()
    {
        ActionBar actionBar = getSupportActionBar();
        actionBar.setDisplayHomeAsUpEnabled(true);
    }

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        MenuInflater inflater = getMenuInflater();
        inflater.inflate(R.menu.menu_ok_only, menu);
        return true;
    }

    public boolean onOptionsItemSelected(MenuItem item){
        if (item.getItemId() == android.R.id.home){
            finish();
            return true;
        }
        else if (item.getItemId() == R.id.action_menu_ok){
            
            String name = _ingredientName.getText().toString();
            String uom = String.valueOf(_uomSpinner.getSelectedItem();
            int quantity = int.valueOf(_quantity.getText();
            int isFavourite = (_favourite.getChecked()) ? 1 : 0;
            int isEssential = (_essential.getChecked()) ? 1 : 0;
        
            StroppingDatabase db = new StroppingDatabase(this);
            db.open();

            if (_ingredient.getId() == 0){
                // new ingredient
                _ingredient = db.createIngredient(name, uom, quantity, quantity, isFavourite, isEssential,0, 0);
            }else{
                db.updateIngredient(_ingredient.getId(), name, uom, quantity, quantity, isFavourite, isEssential,0, 0);
            }

            finish();

            db.close();
        }

        return true;
    }

}
